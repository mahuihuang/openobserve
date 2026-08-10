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

import { mount, VueWrapper } from "@vue/test-utils";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const copyToClipboardMock = vi.fn();
vi.mock("@/utils/clipboard", () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
}));

vi.mock("@/types/i18n", () => ({
  useI18nTyped: () => ({ t: (key: string) => key }),
  raw: (value: string) => value,
}));

import ClickableWords from "./ClickableWords.vue";

const mountComponent = (props: Record<string, unknown> = {}) =>
  mount(ClickableWords, {
    props: { value: "payment failed retry", fieldName: "msg", ...props },
    global: {
      stubs: {
        // The dropdown is a reka-ui overlay; render its trigger and items
        // inline so item clicks are reachable without a real portal.
        ODropdown: {
          template: `<span class="o-dropdown-stub"><slot name="trigger" /><slot /></span>`,
        },
        ODropdownItem: {
          template: `<span class="o-dropdown-item-stub" @click="$emit('select', $event)"><slot name="icon-left" /><slot /><slot name="icon-right" /></span>`,
        },
        ODropdownSeparator: { template: `<hr />` },
        OIcon: { template: `<i />` },
        EqualIcon: { template: `<i />` },
        NotEqualIcon: { template: `<i />` },
      },
    },
  });

describe("ClickableWords", () => {
  let wrapper: VueWrapper<any>;

  beforeEach(() => {
    copyToClipboardMock.mockClear();
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  describe("lazy activation", () => {
    it("renders plain text before any interaction", () => {
      wrapper = mountComponent();

      expect(wrapper.find('[data-test="clickable-words-plain"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="clickable-words-tokens"]').exists()).toBe(false);
      expect(wrapper.text()).toBe("payment failed retry");
    });

    it("tokenizes into words only after being clicked", async () => {
      wrapper = mountComponent();

      await wrapper.find('[data-test="clickable-words-plain"]').trigger("click");

      expect(wrapper.find('[data-test="clickable-words-tokens"]').exists()).toBe(true);
      // 3 words + 2 separators, words carry the clickable class
      expect(wrapper.findAll(".clickable-word")).toHaveLength(3);
      expect(wrapper.text()).toBe("payment failed retry");
    });

    it("keeps punctuation and symbols as non-clickable separators", async () => {
      wrapper = mountComponent({ value: "GET /api/users?id=1" });

      await wrapper.find('[data-test="clickable-words-plain"]').trigger("click");

      const words = wrapper.findAll(".clickable-word").map((w) => w.text());
      expect(words).toEqual(["GET", "api", "users", "id", "1"]);
    });

    it("treats dots, hyphens and underscores as part of a word", async () => {
      wrapper = mountComponent({ value: "host-1.example.com user_id" });

      await wrapper.find('[data-test="clickable-words-plain"]').trigger("click");

      const words = wrapper.findAll(".clickable-word").map((w) => w.text());
      expect(words).toEqual(["host-1.example.com", "user_id"]);
    });
  });

  describe("word menu actions", () => {
    const activateAndSelectWord = async (idx = 0) => {
      wrapper = mountComponent();
      await wrapper.find('[data-test="clickable-words-plain"]').trigger("click");
      await wrapper.find(`[data-test="clickable-word-${idx}"]`).trigger("click");
      await wrapper.vm.$nextTick();
    };

    it("emits word-action with include for the clicked word", async () => {
      await activateAndSelectWord(0);

      await wrapper.find('[data-test="clickable-word-include-btn"]').trigger("click");

      expect(wrapper.emitted()["word-action"]).toEqual([["msg", "payment", "include"]]);
    });

    it("emits word-action with exclude for the clicked word", async () => {
      await activateAndSelectWord(0);

      await wrapper.find('[data-test="clickable-word-exclude-btn"]').trigger("click");

      expect(wrapper.emitted()["word-action"]).toEqual([["msg", "payment", "exclude"]]);
    });

    it("emits open-in-new-tab without emitting word-action", async () => {
      await activateAndSelectWord(0);

      await wrapper.find('[data-test="clickable-word-include-new-tab-btn"]').trigger("click");

      expect(wrapper.emitted()["open-in-new-tab"]).toEqual([["msg", "payment", "include"]]);
      expect(wrapper.emitted()["word-action"]).toBeUndefined();
    });

    it("emits open-in-new-tab for exclude", async () => {
      await activateAndSelectWord(0);

      await wrapper.find('[data-test="clickable-word-exclude-new-tab-btn"]').trigger("click");

      expect(wrapper.emitted()["open-in-new-tab"]).toEqual([["msg", "payment", "exclude"]]);
    });

    it("copies the selected word rather than the whole value", async () => {
      // Token indices count separators too: 0=payment, 1=" ", 2=failed, 3=" ", 4=retry
      await activateAndSelectWord(4);

      await wrapper.find('[data-test="clickable-word-copy-btn"]').trigger("click");

      expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
      expect(copyToClipboardMock.mock.calls[0][0]).toBe("retry");
      expect(wrapper.emitted()["word-action"]).toBeUndefined();
    });

    it("closes the menu after an action is chosen", async () => {
      await activateAndSelectWord(0);
      expect(wrapper.vm.showMenu).toBe(true);

      await wrapper.find('[data-test="clickable-word-include-btn"]').trigger("click");

      expect(wrapper.vm.showMenu).toBe(false);
      expect(wrapper.vm.activeIndex).toBe(null);
    });
  });

  describe("outside click handling", () => {
    it("closes the menu on the first outside click and keeps tokens", async () => {
      wrapper = mountComponent({ attachTo: document.body });
      await wrapper.find('[data-test="clickable-words-plain"]').trigger("click");
      await wrapper.find('[data-test="clickable-word-0"]').trigger("click");
      await wrapper.vm.$nextTick();

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.showMenu).toBe(false);
      expect(wrapper.vm.activated).toBe(true);
    });

    it("collapses back to plain text on a subsequent outside click", async () => {
      wrapper = mountComponent();
      await wrapper.find('[data-test="clickable-words-plain"]').trigger("click");

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.activated).toBe(false);
      expect(wrapper.find('[data-test="clickable-words-plain"]').exists()).toBe(true);
    });
  });
});
