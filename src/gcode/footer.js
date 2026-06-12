// G-code footer: return pen to safe Z, park at origin, end program.

export function buildFooter(params) {
  return [
    '',
    `G0 Z${params.penUpZ} F${params.penLiftFeed}    ; pen up`,
    'G0 X0 Y0       ; return to origin',
    'M30            ; end of program',
    '',
  ].join('\n');
}
