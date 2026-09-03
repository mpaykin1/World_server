(function(global){'use strict';
class WorldLanguageSwitcher extends HTMLElement{
  connectedCallback(){if(this.shadowRoot)return;this.attachShadow({mode:'open'});this.render();global.addEventListener('world:locale',()=>this.render())}
  render(){if(!global.WorldI18n)return;this.shadowRoot.innerHTML='<style>:host{display:inline-block;position:relative;z-index:99998}select{font:13px system-ui;padding:7px 9px;border-radius:10px;background:#111d;color:#fff;border:1px solid #ffffff30;backdrop-filter:blur(8px)}</style>';this.shadowRoot.appendChild(global.WorldI18n.createSelector())}
}
if(!customElements.get('world-language-switcher'))customElements.define('world-language-switcher',WorldLanguageSwitcher);
global.WorldLanguageSwitcher={mount(){if(document.querySelector('world-language-switcher'))return;const e=document.createElement('world-language-switcher');e.style.cssText='position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:99998';document.body.appendChild(e)}};
})(globalThis);
