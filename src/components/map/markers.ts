function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Driver: UBC-blue disc with a white car glyph.
export const DRIVER_ICON = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="17" fill="#002145" stroke="#fff" stroke-width="3"/>
    <g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(10 10) scale(0.84)">
      <path d="M5 17h14M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z"/>
      <circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>
    </g>
  </svg>`
);

// Rider: light-blue pin.
export const RIDER_ICON = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 38s12-11 12-22A12 12 0 1 0 3 16c0 11 12 22 12 22z" fill="#00A7E1" stroke="#fff" stroke-width="2.5"/>
    <circle cx="15" cy="16" r="4.5" fill="#fff"/>
  </svg>`
);

// You: blue dot with a soft halo.
export const SELF_ICON = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="16" fill="#0055B7" fill-opacity="0.18"/>
    <circle cx="18" cy="18" r="7" fill="#0055B7" stroke="#fff" stroke-width="3"/>
  </svg>`
);
