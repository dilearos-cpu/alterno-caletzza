class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLinks = document.querySelectorAll('#cart-icon-bubble, [data-cart-drawer-open]');
    cartLinks.forEach((cartLink) => {
      if (!cartLink) return;
      cartLink.setAttribute('role', 'button');
      cartLink.setAttribute('aria-haspopup', 'dialog');
      cartLink.addEventListener('keydown', (event) => {
        if (event.code.toUpperCase() === 'SPACE') {
          event.preventDefault();
          this.open(cartLink);
        }
      });
    });

    if (!CartDrawer._cartIconDelegationBound) {
      CartDrawer._cartIconDelegationBound = true;
      document.addEventListener(
        'click',
        (event) => {
          const cartLink =
            event.target && event.target.closest
              ? event.target.closest('#cart-icon-bubble, [data-cart-drawer-open]')
              : null;
          if (!cartLink) return;
          const drawer = document.querySelector('cart-drawer');
          if (!drawer || typeof drawer.open !== 'function') return;
          event.preventDefault();
          drawer.open(cartLink);
        },
        true
      );
    }
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  syncEmptyState(isEmpty) {
    this.classList.toggle('is-empty', isEmpty);
    const drawerInner = this.querySelector('.drawer__inner');
    if (drawerInner) drawerInner.classList.toggle('is-empty', isEmpty);
    const drawerItems = this.querySelector('cart-drawer-items');
    if (drawerItems) drawerItems.classList.toggle('is-empty', isEmpty);
  }

  renderContents(parsedState) {
    // /cart/add.js returns a line item (id/quantity), not a full cart.
    // Prefer explicit counts; otherwise treat a successful add as non-empty.
    const rawCount =
      parsedState &&
      (parsedState.item_count ??
        (Array.isArray(parsedState.items) ? parsedState.items.length : null));
    let itemCount =
      rawCount != null && rawCount !== ''
        ? Number(rawCount)
        : parsedState && (parsedState.id != null || parsedState.variant_id != null)
          ? 1
          : 0;
    if (!Number.isFinite(itemCount)) itemCount = 1;
    let isEmpty = itemCount <= 0;

    this.syncEmptyState(isEmpty);

    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      const html = parsedState.sections && parsedState.sections[section.id];
      if (!html) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(html, section.selector);
    });

    // After HTML replace: trust DOM (items present ⇒ not empty).
    // Prevents blank drawer when is-empty stays on <cart-drawer> and
    // component-cart.css hides .cart__contents under .is-empty.
    const hasLineItems = Boolean(
      this.querySelector('#CartDrawer-CartItems .cart-item, .cart-item, cart-drawer-items .cart-item')
    );
    if (hasLineItems) isEmpty = false;
    this.syncEmptyState(isEmpty);

    setTimeout(() => {
      const overlay = this.querySelector('#CartDrawer-Overlay');
      if (overlay) overlay.addEventListener('click', this.close.bind(this));
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector(selector);
    return el ? el.innerHTML : '';
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
