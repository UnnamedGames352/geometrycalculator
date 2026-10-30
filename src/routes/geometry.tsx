import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/geometry")({
  head: () => ({
    meta: [
      { title: "Secret Geometry Resources" },
      { name: "description", content: "Geometry formulas, a shape calculator, and problem-solving strategies." },
      { property: "og:title", content: "Secret Geometry Resources" },
      { property: "og:description", content: "Geometry formulas, a shape calculator, and problem-solving strategies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Geometry,
});

const formulas = [
  ["Area of a rectangle", "A = l × w"],
  ["Area of a triangle", "A = ½ × b × h"],
  ["Area of a circle", "A = πr²"],
  ["Circumference", "C = 2πr"],
  ["Pythagorean theorem", "a² + b² = c²"],
  ["Area of a trapezoid", "A = ½(b₁ + b₂)h"],
  ["Volume of a cube", "V = s³"],
  ["Volume of a cylinder", "V = πr²h"],
  ["Volume of a sphere", "V = ⁴⁄₃πr³"],
  ["Interior angles of a polygon", "(n − 2) × 180°"],
];

const strategies = [
  "Draw and label a diagram before doing anything else.",
  "Look for right triangles hiding inside other shapes.",
  "Split odd shapes into rectangles and triangles, then add the areas.",
  "Check units: area is squared, volume is cubed.",
  "Angles on a straight line add to 180°, around a point to 360°.",
  "Similar shapes have proportional sides — set up a ratio.",
];

type Shape = "circle" | "rectangle" | "triangle" | "hypotenuse";

function calc(shape: Shape, a: number, b: number) {
  switch (shape) {
    case "circle": return { label: "Area", value: Math.PI * a * a };
    case "rectangle": return { label: "Area", value: a * b };
    case "triangle": return { label: "Area", value: 0.5 * a * b };
    case "hypotenuse": return { label: "Hypotenuse", value: Math.hypot(a, b) };
  }
}

function Geometry() {
  const [shape, setShape] = useState<Shape>("circle");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const labels: Record<Shape, [string, string?]> = {
    circle: ["Radius"],
    rectangle: ["Length", "Width"],
    triangle: ["Base", "Height"],
    hypotenuse: ["Side a", "Side b"],
  };
  const [l1, l2] = labels[shape];
  const na = parseFloat(a), nb = l2 ? parseFloat(b) : 0;
  const res = !isNaN(na) && !isNaN(nb) ? calc(shape, na, nb) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Classified</p>
        <h1 className="mt-2 text-4xl font-bold">Secret Geometry Resources</h1>
        <p className="mt-2 text-muted-foreground">Formulas, a quick calculator, and strategies for solving any geometry problem.</p>

        <section className="mt-10 rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold">Shape calculator</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(labels) as Shape[]).map((s) => (
              <button key={s} onClick={() => setShape(s)}
                className={`rounded border border-border px-3 py-1 text-sm capitalize ${shape === s ? "bg-primary text-primary-foreground" : ""}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <input value={a} onChange={(e) => setA(e.target.value)} placeholder={l1} inputMode="decimal"
              className="w-32 rounded border border-border bg-background px-2 py-1" />
            {l2 && <input value={b} onChange={(e) => setB(e.target.value)} placeholder={l2} inputMode="decimal"
              className="w-32 rounded border border-border bg-background px-2 py-1" />}
          </div>
          <p className="mt-4 font-mono">{res ? `${res.label} = ${res.value.toFixed(3)}` : "Enter values above"}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Formulas</h2>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {formulas.map(([n, f]) => (
              <li key={n} className="flex justify-between px-4 py-2"><span>{n}</span><span className="font-mono">{f}</span></li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Strategies</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-6">
            {strategies.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </section>
      </div>
    </div>
  );
}
