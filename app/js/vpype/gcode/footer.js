// G-code program footer — final pen lift + M30 program end.

export function footer({ penUpZ, zFeed }) {
    return [
        `G1 Z${penUpZ.toFixed(3)} F${zFeed} (final pen up)`,
        "M30",
        "",
    ].join("\n");
}
