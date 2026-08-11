// region-shapes.js – Shape-specific SVG helpers for the region system

const RegionShapes = (() => {

  /** Create the SVG shape element for a region. */
  function createElement(shape) {
    const ns = 'http://www.w3.org/2000/svg';
    return document.createElementNS(ns, shape === 'rect' ? 'rect' : 'ellipse');
  }

  /** Apply position/size attributes to a shape element.
   *  pos = {x,y} SVG center coords; rx/ry = SVG pixel half-dimensions. */
  function applyAttrs(el, shape, pos, rx, ry) {
    if (shape === 'rect') {
      el.setAttribute('x',      pos.x - rx);
      el.setAttribute('y',      pos.y - ry);
      el.setAttribute('width',  rx * 2);
      el.setAttribute('height', ry * 2);
    } else {
      el.setAttribute('cx', pos.x);
      el.setAttribute('cy', pos.y);
      el.setAttribute('rx', rx);
      el.setAttribute('ry', ry);
    }
  }

  /** Returns true if fractional point {x,y} is inside the region. */
  function hitTest(region, frac) {
    const nx = (frac.x - region.cx) / region.rx;
    const ny = (frac.y - region.cy) / region.ry;
    return region.shape === 'rect'
      ? Math.abs(nx) <= 1 && Math.abs(ny) <= 1
      : nx * nx + ny * ny <= 1;
  }

  return { createElement, applyAttrs, hitTest };
})();
