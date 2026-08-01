/**
 * This function is serialized and executed INSIDE the page context via
 * page.evaluate(). It cannot reference anything from the Node process —
 * only browser globals (document, window, getComputedStyle, etc).
 *
 * It is intentionally verbose/self-contained rather than importing
 * PageContext types, since those types don't exist in the browser realm.
 */
export async function collectPageDataInBrowser() {
  function isElementVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function viewportIntersectionRatio(el: Element): number {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const overlapX = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const overlapY = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const overlapArea = overlapX * overlapY;
    const elArea = rect.width * rect.height;
    if (elArea <= 0) return 0;
    return Math.max(0, Math.min(1, overlapArea / elArea));
  }

  function buildSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      let part = node.tagName.toLowerCase();
      if (node.classList.length > 0) {
        part += "." + Array.from(node.classList).slice(0, 2).join(".");
      }
      const parent: Element | null = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === node!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${index})`;
        }
      }
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

  function isInteractive(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) return true;
    const role = el.getAttribute("role");
    if (role && ["button", "link", "menuitem", "tab"].includes(role)) return true;
    if (el.hasAttribute("onclick")) return true;
    return false;
  }

  function computeAccessibleName(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
      if (text) return text;
    }

    const textContent = (el.textContent || "").trim();
    if (textContent) return textContent;

    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();

    const childImg = el.querySelector("img[alt]");
    if (childImg) {
      const alt = childImg.getAttribute("alt");
      if (alt && alt.trim()) return alt.trim();
    }

    return "";
  }

  function hasMeaningfulChildContent(el: Element): boolean {
    const text = (el.textContent || "").trim();
    if (text.length > 0) return true;
    const mediaChild = el.querySelector("img, svg, [class*='icon']");
    if (mediaChild) {
      const rect = mediaChild.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  function getFormFieldInfo(el: Element):
    | {
        inputType?: string;
        hasLabelElement: boolean;
        hasAriaLabel: boolean;
        hasAriaLabelledBy: boolean;
        hasPlaceholder: boolean;
        isHidden: boolean;
      }
    | undefined {
    const tag = el.tagName.toLowerCase();
    if (!["input", "select", "textarea"].includes(tag)) return undefined;

    const inputEl = el as HTMLInputElement;
    const inputType = tag === "input" ? inputEl.type : undefined;
    if (inputType === "hidden") {
      return {
        inputType,
        hasLabelElement: false,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        hasPlaceholder: false,
        isHidden: true,
      };
    }

    const id = el.getAttribute("id");
    let hasLabelElement = false;
    if (id) {
      try {
        hasLabelElement = !!document.querySelector(`label[for="${CSS.escape(id)}"]`);
      } catch {
        hasLabelElement = false;
      }
    }
    if (!hasLabelElement) {
      let parent: Element | null = el.parentElement;
      let depth = 0;
      while (parent && depth < 3) {
        if (parent.tagName.toLowerCase() === "label") {
          hasLabelElement = true;
          break;
        }
        parent = parent.parentElement;
        depth++;
      }
    }

    const isHidden =
      el.getAttribute("aria-hidden") === "true" ||
      (el as HTMLElement).tabIndex === -1 && !isElementVisible(el);

    return {
      inputType,
      hasLabelElement,
      hasAriaLabel: !!el.getAttribute("aria-label"),
      hasAriaLabelledBy: !!el.getAttribute("aria-labelledby"),
      hasPlaceholder: el.hasAttribute("placeholder"),
      isHidden,
    };
  }

  function isInsideHorizontalScrollContainer(el: Element): boolean {
    let node: Element | null = el.parentElement;
    let depth = 0;
    while (node && depth < 12) {
      const nodeStyle = window.getComputedStyle(node);
      const scrollable = nodeStyle.overflowX === "auto" || nodeStyle.overflowX === "scroll";
      if (scrollable && (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth) {
        return true;
      }
      node = node.parentElement;
      depth++;
    }
    return false;
  }

  function getEffectiveBackground(el: Element): { color: string; unresolved: boolean } {
    let node: Element | null = el;
    let depth = 0;
    while (node && depth < 12) {
      const nodeStyle = window.getComputedStyle(node);
      if (nodeStyle.backgroundImage && nodeStyle.backgroundImage !== "none") {
        // A gradient/image background anywhere between the target element
        // and a resolved solid color means we cannot reliably compute
        // contrast — better to skip than to guess against the wrong color.
        return { color: "", unresolved: true };
      }
      const bg = nodeStyle.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        return { color: bg, unresolved: false };
      }
      node = node.parentElement;
      depth++;
    }
    return { color: "rgb(255, 255, 255)", unresolved: false };
  }

  // Cap the number of elements collected to protect against
  // pathologically large DOMs (resource-exhaustion defense).
  const MAX_ELEMENTS = 5000;
  const allElements = Array.from(document.querySelectorAll("body, body *")).slice(
    0,
    MAX_ELEMENTS
  );

  const elements = allElements.map((el, idx) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const attributes: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }
    const interactive = isInteractive(el);
    const effectiveBg = getEffectiveBackground(el);
    return {
      id: `el_${idx}`,
      selector: buildSelector(el),
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || undefined,
      text: (el.textContent || "").trim().slice(0, 300),
      visibleText: isElementVisible(el) ? (el.textContent || "").trim().slice(0, 300) : "",
      attributes,
      boundingBox:
        rect.width > 0 || rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null,
      viewportIntersection: viewportIntersectionRatio(el),
      isVisible: isElementVisible(el),
      isInteractive: interactive,
      ariaHidden: el.getAttribute("aria-hidden") === "true",
      accessibleName: interactive ? computeAccessibleName(el) : undefined,
      hasMeaningfulChildContent: hasMeaningfulChildContent(el),
      formFieldInfo: getFormFieldInfo(el),
      effectiveBackgroundColor: effectiveBg.color,
      hasUnresolvedBackground: effectiveBg.unresolved,
      isInsideHorizontalScrollContainer: isInsideHorizontalScrollContainer(el),
      computedStyle: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        zIndex: style.zIndex,
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        webkitLineClamp: (style as any).webkitLineClamp || (style as any).WebkitLineClamp || "none",
        transform: style.transform,
      },
      layoutMetrics: {
        clientWidth: (el as HTMLElement).clientWidth || 0,
        clientHeight: (el as HTMLElement).clientHeight || 0,
        scrollWidth: (el as HTMLElement).scrollWidth || 0,
        scrollHeight: (el as HTMLElement).scrollHeight || 0,
        offsetWidth: (el as HTMLElement).offsetWidth || 0,
        offsetHeight: (el as HTMLElement).offsetHeight || 0,
      },
    };
  });

  const images = Array.from(document.querySelectorAll("img")).map((img, idx) => {
    const rect = img.getBoundingClientRect();
    const ariaHidden = img.getAttribute("aria-hidden") === "true";
    return {
      elementId: `img_${idx}`,
      selector: buildSelector(img),
      src: img.getAttribute("src") || undefined,
      currentSrc: img.currentSrc || undefined,
      alt: img.hasAttribute("alt") ? img.getAttribute("alt")! : undefined,
      role: img.getAttribute("role") || undefined,
      ariaHidden,
      isVisible: isElementVisible(img),
      boundingBox:
        rect.width > 0 || rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    };
  });

  const svgs = Array.from(document.querySelectorAll("svg")).map((svg, idx) => {
    const rect = svg.getBoundingClientRect();
    const hasVisibleShape = Array.from(
      svg.querySelectorAll("path, circle, rect, polygon, line, ellipse, polyline")
    ).length > 0;
    const classAttr = svg.getAttribute("class") || "";
    return {
      elementId: `svg_${idx}`,
      selector: buildSelector(svg),
      isVisible: isElementVisible(svg),
      boundingBox:
        rect.width > 0 || rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null,
      hasVisibleShape,
      role: svg.getAttribute("role") || undefined,
      ariaLabel: svg.getAttribute("aria-label") || undefined,
      ariaHidden: svg.getAttribute("aria-hidden") === "true",
      isLikelyIconFont: /icon/i.test(classAttr),
    };
  });

  // document.fonts.ready can hang on a handful of edge cases (e.g. a
  // font that never resolves); race it against a bounded timeout so a
  // single bad @font-face declaration can't stall the whole scan.
  let fonts: { family: string; status: string; source?: string }[] = [];
  try {
    await Promise.race([
      (document as any).fonts?.ready,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    fonts = Array.from((document as any).fonts || []).map((f: any) => ({
      family: f.family,
      status: f.status,
    }));
  } catch {
    fonts = [];
  }

  const doc = document.documentElement;
  return {
    elements,
    images,
    svgs,
    fonts,
    documentWidth: doc.scrollWidth,
    documentHeight: doc.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: doc.scrollWidth,
    scrollHeight: doc.scrollHeight,
    hasHorizontalScroll: doc.scrollWidth > window.innerWidth,
  };
}
