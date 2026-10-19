(() => {
  const cache = new Map();
  let instanceCount = 0;

  class AllurePredictiveSearch extends HTMLElement {
    connectedCallback() {
      if (this.dataset.enabled === 'false') return;
      if (this.input) {
        document.addEventListener('pointerdown', this.outsideClick);
        return;
      }
      this.input = this.querySelector('input[name="q"]');
      this.panel = this.querySelector('.predictive-search');
      this.status = this.querySelector('[data-search-status]');
      this.idPrefix = `predictive-search-${++instanceCount}`;
      this.input.setAttribute('role', 'combobox');
      this.input.setAttribute('aria-autocomplete', 'list');
      this.input.setAttribute('aria-expanded', 'false');
      this.input.setAttribute('autocomplete', 'off');
      this.input.addEventListener('input', event => {
        this.close();
        if (!event.isComposing) this.schedule();
      });
      this.input.addEventListener('compositionend', () => this.schedule());
      this.input.addEventListener('focus', () => this.schedule());
      this.addEventListener('keydown', event => this.onKeydown(event));
      this.addEventListener('focusout', event => {
        if (!this.contains(event.relatedTarget)) this.close();
      });
      this.outsideClick = event => {
        if (!this.contains(event.target)) this.close();
      };
      document.addEventListener('pointerdown', this.outsideClick);
    }

    disconnectedCallback() {
      if (!this.input) return;
      this.close();
      document.removeEventListener('pointerdown', this.outsideClick);
    }

    schedule() {
      clearTimeout(this.timer);
      const query = this.input.value.trim();
      if (!query) return;
      this.timer = setTimeout(() => this.search(query), 180);
    }

    async search(query) {
      const params = new URLSearchParams({
        q: query,
        'resources[type]': 'query,collection,page,article,product',
        'resources[limit]': '6',
        'resources[limit_scope]': 'each',
        section_id: 'predictive-search'
      });
      const url = `${this.dataset.url}?${params}`;
      this.controller?.abort();
      const controller = new AbortController();
      this.controller = controller;
      this.status.textContent = this.dataset.loading;
      this.panel.setAttribute('aria-busy', 'true');

      try {
        let html = cache.get(url);
        if (!html) {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('Search unavailable');
          const document = new DOMParser().parseFromString(await response.text(), 'text/html');
          const results = document.querySelector('[data-predictive-results]');
          if (!results) throw new Error('Missing search results');
          html = results.outerHTML;
          if (cache.size >= 30) cache.delete(cache.keys().next().value);
          cache.set(url, html);
        }
        if (controller.signal.aborted || query !== this.input.value.trim() || document.activeElement !== this.input) return;
        this.panel.innerHTML = html;
        const listbox = this.panel.querySelector('[role="listbox"]');
        listbox.id = `${this.idPrefix}-list`;
        this.input.setAttribute('aria-controls', listbox.id);
        this.options = Array.from(this.panel.querySelectorAll('[role="option"]'));
        this.options.forEach((option, index) => { option.id = `${this.idPrefix}-${index}`; });
        this.activeIndex = -1;
        this.panel.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
        this.status.textContent = this.panel.firstElementChild.dataset.status;
      } catch (error) {
        if (error.name !== 'AbortError' && this.controller === controller) this.close();
      } finally {
        if (this.controller === controller) this.panel.removeAttribute('aria-busy');
      }
    }

    close() {
      clearTimeout(this.timer);
      this.controller?.abort();
      this.panel.hidden = true;
      this.panel.removeAttribute('aria-busy');
      this.input.setAttribute('aria-expanded', 'false');
      this.input.removeAttribute('aria-activedescendant');
      this.status.textContent = '';
      this.activeIndex = -1;
    }

    onKeydown(event) {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        if (!this.panel.hidden) this.input.focus();
        this.close();
        return;
      }
      if (this.panel.hidden || event.target !== this.input) return;
      if (event.key === 'Enter' && this.activeIndex >= 0) {
        event.preventDefault();
        this.options[this.activeIndex].click();
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = this.activeIndex < 0
        ? (direction === 1 ? 0 : this.options.length - 1)
        : (this.activeIndex + direction + this.options.length) % this.options.length;
      this.options.forEach((option, index) => {
        option.setAttribute('aria-selected', String(index === this.activeIndex));
      });
      const option = this.options[this.activeIndex];
      this.input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }
  }

  if (!customElements.get('allure-predictive-search')) {
    customElements.define('allure-predictive-search', AllurePredictiveSearch);
  }
})();
