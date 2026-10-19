// Copyright 2026 OpenObserve Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

#[cfg(feature = "enterprise")]
use axum::response::Response;
#[cfg(feature = "enterprise")]
use common::meta::http::HttpResponse as MetaHttpResponse;
#[cfg(feature = "enterprise")]
use config::meta::stream::StreamType;
use config::meta::user::UserRole;
#[cfg(feature = "enterprise")]
use db::user::is_root_user;

use crate::auth::AuthExtractor;

#[cfg(feature = "enterprise")]
#[derive(Clone, Copy)]
pub enum StreamPermissionResourceType {
    Search,
    PatternExtract,
    Insights,
}

/// Checks stream permissions, returning `Some(forbidden response)` when the
/// user is not permitted and `None` when access is allowed.
#[cfg(feature = "enterprise")]
pub async fn check_stream_permissions(
    stream_name: &str,
    org_id: &str,
    user_id: &str,
    stream_type: &StreamType,
    permission_resource_type: StreamPermissionResourceType,
) -> Option<Response> {
    if is_root_user(user_id) {
        return None;
    }

    use o2_openfga::{
        config::get_config,
        meta::mapping::{LOGS_INSIGHTS_KEY, LOGS_PATTERN_KEY, OFGA_MODELS},
    };

    // A user can hit this with an org they are not a member of (e.g. the search
    // profile endpoint always checks against _meta), so a missing user is a
    // deny, not a panic.
    let Some(user) = crate::users::get_user(Some(org_id), user_id).await else {
        return Some(MetaHttpResponse::forbidden("Unauthorized Access"));
    };
    let stream_type_str = stream_type.as_str();
    let config = get_config();
    let mut o2_model_type = "";

    match permission_resource_type {
        StreamPermissionResourceType::PatternExtract if config.logs_pattern_rbac_enabled => {
            o2_model_type = LOGS_PATTERN_KEY;
        }
        StreamPermissionResourceType::Insights if config.logs_pattern_rbac_enabled => {
            o2_model_type = LOGS_INSIGHTS_KEY;
        }
        _ => {}
    }

    if o2_model_type.is_empty() {
        o2_model_type = OFGA_MODELS
            .get(stream_type_str)
            .map_or(stream_type_str, |model| model.key);
    }

    if check_permissions(
        user_id,
        AuthExtractor {
            auth: "".to_string(),
            method: "GET".to_string(),
            o2_type: format!(
                "{}:{}",
                o2_model_type,
                crate::auth::into_ofga_supported_format(stream_name)
            ),
            org_id: org_id.to_string(),
            bypass_check: false,
            parent_id: "".to_string(),
            use_all_org: false,
            use_self_context: false,
            use_self_parent: true,
        },
        user.role,
        user.is_external,
    )
    .await
    {
        None
    } else {
        Some(MetaHttpResponse::forbidden("Unauthorized Access"))
    }
}

#[cfg(feature = "enterprise")]
pub async fn check_permissions(
    user_id: &str,
    auth_info: AuthExtractor,
    role: UserRole,
    _is_external: bool,
) -> bool {
    use common::infra::config::ORG_USERS;

    if !o2_openfga::config::get_config().enabled {
        return true;
    }

    if o2_enterprise::enterprise::license::block_feature_for_report_failure().await {
        return true;
    }

    let object_str = auth_info.o2_type;
    log::debug!("Role of user {user_id} is {role:#?}");
    let role = if role == UserRole::Root {
        return true;
    } else {
        role.to_string()
    };

    let org_id = &auth_info.org_id;
    let effective_role = if org_id == config::META_ORG_ID {
        match ORG_USERS.get(&format!("{}/{user_id}", config::META_ORG_ID)) {
            Some(user) => user.role.to_string(),
            None => role,
        }
    } else {
        role
    };

    o2_openfga::authorizer::authz::is_allowed(
        org_id,
        user_id,
        &auth_info.method,
        &object_str,
        &auth_info.parent_id,
        &effective_role,
        auth_info.use_all_org,
        auth_info.use_self_context,
        auth_info.use_self_parent,
    )
    .await
}

#[cfg(not(feature = "enterprise"))]
pub async fn check_permissions(
    _user_id: &str,
    auth_info: AuthExtractor,
    role: UserRole,
    _is_external: bool,
) -> bool {
    // Root and Admin have full access
    if role.eq(&UserRole::Root) || role.eq(&UserRole::Admin) {
        return true;
    }

    // ServiceAccount: allow all (access is controlled by token scope)
    if role.eq(&UserRole::ServiceAccount) {
        return true;
    }

    let method = auth_info.method.as_str();

    // Editor: can read and write, but cannot delete
    if role.eq(&UserRole::Editor) {
        return method != "DELETE";
    }

    // Viewer: read-only access. POST-based search/query endpoints are already
    // allowed earlier via `bypass_check` in the auth extractor.
    if role.eq(&UserRole::Viewer) {
        return method == "GET";
    }

    // SreAgent is a system-managed account that only ever gets provisioned by
    // enterprise builds (`organization::ensure_sys_rca_agent` is
    // `cfg(feature = "enterprise")`), and `check_role_available` rejects it as
    // an API-assignable role. So an OSS build should never see it; deny rather
    // than inherit ServiceAccount's blanket allow. Note that
    // `UserRole::is_service_account()` returns true for SreAgent — do not fold
    // this into the ServiceAccount branch above via that helper.
    if role.eq(&UserRole::SreAgent) {
        return false;
    }

    // User role: minimal access (login only, no API access)
    false
}

pub async fn list_objects_for_user(
    org_id: &str,
    user_id: &str,
    permission: &str,
    object_type: &str,
) -> anyhow::Result<Option<Vec<String>>> {
    db::authz::list_objects_for_user(org_id, user_id, permission, object_type).await
}

#[cfg(all(test, not(feature = "enterprise")))]
mod tests {
    use config::meta::user::UserRole;

    use super::check_permissions;
    use crate::auth::AuthExtractor;

    fn extractor(method: &str) -> AuthExtractor {
        AuthExtractor {
            auth: String::new(),
            method: method.to_string(),
            o2_type: "dashboard:default".to_string(),
            org_id: "default".to_string(),
            bypass_check: false,
            parent_id: String::new(),
            use_all_org: false,
            use_self_context: false,
            use_self_parent: false,
        }
    }

    async fn allowed(role: UserRole, method: &str) -> bool {
        check_permissions("user@example.com", extractor(method), role, false).await
    }

    const METHODS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

    #[tokio::test]
    async fn root_admin_and_service_account_have_full_access() {
        for role in [UserRole::Root, UserRole::Admin, UserRole::ServiceAccount] {
            for method in METHODS {
                assert!(
                    allowed(role.clone(), method).await,
                    "{role} should be allowed {method}"
                );
            }
        }
    }

    #[tokio::test]
    async fn editor_can_read_and_write_but_not_delete() {
        for method in ["GET", "POST", "PUT", "PATCH"] {
            assert!(allowed(UserRole::Editor, method).await, "editor {method}");
        }
        assert!(!allowed(UserRole::Editor, "DELETE").await);
    }

    #[tokio::test]
    async fn viewer_is_read_only() {
        assert!(allowed(UserRole::Viewer, "GET").await);
        for method in ["POST", "PUT", "PATCH", "DELETE"] {
            assert!(!allowed(UserRole::Viewer, method).await, "viewer {method}");
        }
    }

    #[tokio::test]
    async fn user_role_has_no_api_access() {
        for method in METHODS {
            assert!(!allowed(UserRole::User, method).await, "user {method}");
        }
    }

    /// SreAgent is enterprise-provisioned only; an OSS build must not inherit
    /// ServiceAccount's blanket allow for it.
    #[tokio::test]
    async fn sre_agent_is_denied() {
        for method in METHODS {
            assert!(!allowed(UserRole::SreAgent, method).await, "sre {method}");
        }
    }
}
