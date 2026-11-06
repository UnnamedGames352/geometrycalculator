import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/geometry")({
  head: () => ({
    meta: [
      { title: "Geometry Class Toolkit" },
      {
        name: "description",
        content: "A practical geometry reference with formulas, worked examples, and an interactive calculator.",
      },
      { property: "og:title", content: "Geometry Class Toolkit" },
      {
        property: "og:description",
        content: "Review geometry formulas, angle facts, and problem-solving strategies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Geometry,
});

type Shape =
  | "circle"
  | "rectangle"
  | "triangle"
  | "rightTriangle"
  | "trapezoid"
  | "cylinder"
  | "sphere";

type Calculation = { label: string; value: number; unit: "units" | "units²" | "units³" };
type Calculator = {
  name: string;
  description: string;
  inputs: string[];
  calculate: (values: number[]) => Calculation[];
};

const calculators: Record<Shape, Calculator> = {
  circle: {
    name: "Circle",
    description: "Enter the radius to find area and circumference.",
    inputs: ["Radius (r)"],
    calculate: ([r]) => [
      { label: "Area", value: Math.PI * r! ** 2, unit: "units²" },
      { label: "Circumference", value: 2 * Math.PI * r!, unit: "units" },
    ],
  },
  rectangle: {
    name: "Rectangle",
    description: "Enter the length and width to find area and perimeter.",
    inputs: ["Length (l)", "Width (w)"],
    calculate: ([l, w]) => [
      { label: "Area", value: l! * w!, unit: "units²" },
      { label: "Perimeter", value: 2 * (l! + w!), unit: "units" },
    ],
  },
  triangle: {
    name: "Triangle area",
    description: "Use the perpendicular height, not a slanted side.",
    inputs: ["Base (b)", "Height (h)"],
    calculate: ([b, h]) => [{ label: "Area", value: (b! * h!) / 2, unit: "units²" }],
  },
  rightTriangle: {
    name: "Right triangle",
    description: "Enter both legs to find the hypotenuse and area.",
    inputs: ["Leg a", "Leg b"],
    calculate: ([a, b]) => [
      { label: "Hypotenuse (c)", value: Math.hypot(a!, b!), unit: "units" },
      { label: "Area", value: (a! * b!) / 2, unit: "units²" },
    ],
  },
  trapezoid: {
    name: "Trapezoid",
    description: "Enter the two parallel bases and the perpendicular height.",
    inputs: ["Base 1 (b₁)", "Base 2 (b₂)", "Height (h)"],
    calculate: ([b1, b2, h]) => [
      { label: "Area", value: ((b1! + b2!) * h!) / 2, unit: "units²" },
    ],
  },
  cylinder: {
    name: "Cylinder",
    description: "Find the volume of a cylinder from its radius and height.",
    inputs: ["Radius (r)", "Height (h)"],
    calculate: ([r, h]) => [{ label: "Volume", value: Math.PI * r! ** 2 * h!, unit: "units³" }],
  },
  sphere: {
    name: "Sphere",
    description: "Enter the radius to find the sphere's volume.",
    inputs: ["Radius (r)"],
    calculate: ([r]) => [{ label: "Volume", value: (4 / 3) * Math.PI * r! ** 3, unit: "units³" }],
  },
};

const formulaGroups = [
  {
    title: "Plane figures",
    formulas: [
      ["Rectangle area", "A = lw"],
      ["Rectangle perimeter", "P = 2l + 2w"],
      ["Triangle area", "A = ½bh"],
      ["Parallelogram area", "A = bh"],
      ["Trapezoid area", "A = ½(b₁ + b₂)h"],
      ["Circle area", "A = πr²"],
      ["Circle circumference", "C = 2πr = πd"],
    ],
  },
  {
    title: "Triangles and angles",
    formulas: [
      ["Pythagorean theorem", "a² + b² = c² (right triangles)"],
      ["Triangle angle sum", "A + B + C = 180°"],
      ["Interior angle sum", "(n − 2) × 180°"],
      ["Regular polygon interior angle", "((n − 2) × 180°) ÷ n"],
      ["Distance on a coordinate plane", "d = √((x₂ − x₁)² + (y₂ − y₁)²)"],
    ],
  },
  {
    title: "Solid figures",
    formulas: [
      ["Rectangular prism volume", "V = lwh"],
      ["Prism volume", "V = (area of base) × height"],
      ["Cylinder volume", "V = πr²h"],
      ["Sphere volume", "V = ⁴⁄₃πr³"],
      ["Surface area of a cube", "SA = 6s²"],
    ],
  },
];

const angleFacts = [
  ["Complementary", "Two angles add to 90°."],
  ["Supplementary", "Two angles add to 180°."],
  ["Vertical angles", "Opposite angles formed by intersecting lines are equal."],
  ["Linear pair", "Adjacent angles on a straight line add to 180°."],
  ["Parallel lines", "Corresponding and alternate interior angles are equal; same-side interior angles add to 180°."],
  ["Exterior angle", "A triangle's exterior angle equals the sum of its two remote interior angles."],
];

const problemSteps = [
  ["1", "Sketch it", "Draw and label the shape. Mark right angles, parallel lines, and the measurements you know."],
  ["2", "Choose a relationship", "Decide whether the problem is about area, perimeter, volume, angle sums, similarity, or a right triangle."],
  ["3", "Write the formula first", "Substitute values with parentheses, then solve. Keep the units attached to your work."],
  ["4", "Check your answer", "Lengths should be positive; area uses square units, volume uses cubic units, and your result should be reasonable."],
];

function Geometry() {
  const [shape, setShape] = useState<Shape>("circle");
  const [values, setValues] = useState<string[]>([""]);
  const calculator = calculators[shape];
  const numbers = calculator.inputs.map((_, index) => Number(values[index] ?? ""));
  const valid = numbers.every((value) => Number.isFinite(value) && value > 0);
  const results = valid ? calculator.calculate(numbers) : null;

  function selectShape(nextShape: Shape) {
    setShape(nextShape);
    setValues(Array(calculators[nextShape].inputs.length).fill(""));
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Geometry class toolkit</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Understand the shape of the problem.</h1>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            A quick classroom reference for formulas, angle relationships, and checking your work. Use the calculator to practice applying the formulas—not just memorizing them.
          </p>
          <nav aria-label="Page sections" className="mt-6 flex flex-wrap gap-3 text-sm">
            <a className="text-primary underline-offset-4 hover:underline" href="#calculator">Calculator</a>
            <a className="text-primary underline-offset-4 hover:underline" href="#formulas">Formula sheet</a>
            <a className="text-primary underline-offset-4 hover:underline" href="#angles">Angle facts</a>
            <a className="text-primary underline-offset-4 hover:underline" href="#solving">How to solve</a>
          </nav>
        </header>

        <section id="calculator" className="mt-10 scroll-mt-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-sm font-semibold text-primary">Practice tool</p>
            <h2 className="mt-1 text-2xl font-bold">Geometry calculator</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choose a figure, enter positive measurements, and include the correct units in your written answer.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Choose a geometry calculation">
            {(Object.keys(calculators) as Shape[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={shape === key}
                onClick={() => selectShape(key)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${shape === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
              >
                {calculators[key].name}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{calculator.description}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {calculator.inputs.map((label, index) => (
              <label key={label} className="grid gap-1.5 text-sm font-medium">
                {label}
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={values[index] ?? ""}
                  onChange={(event) => setValues((current) => current.map((value, i) => i === index ? event.target.value : value))}
                  placeholder="Enter a value"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal"
                />
              </label>
            ))}
          </div>
          <div aria-live="polite" className="mt-5 rounded-lg bg-muted/50 p-4">
            {results ? (
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {results.map((result) => (
                  <p key={result.label} className="font-mono text-lg">
                    <span className="font-sans text-sm text-muted-foreground">{result.label}: </span>
                    {result.value.toFixed(3)} {result.unit}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Enter a positive number in each field to see your result.</p>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Calculator answers are rounded to 3 decimal places. Use exact values such as π when your class expects them.</p>
        </section>

        <section id="formulas" className="mt-12 scroll-mt-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">Quick reference</p>
            <h2 className="mt-1 text-3xl font-bold">Formula sheet</h2>
            <p className="mt-2 text-muted-foreground">Identify what the question asks for first. Perimeter measures around a 2D shape; area covers a 2D surface; volume fills a 3D object.</p>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {formulaGroups.map((group) => (
              <article key={group.title} className="rounded-xl border border-border p-5">
                <h3 className="text-lg font-semibold">{group.title}</h3>
                <dl className="mt-3 divide-y divide-border">
                  {group.formulas.map(([name, formula]) => (
                    <div key={name} className="py-3 first:pt-0 last:pb-0">
                      <dt className="text-sm text-muted-foreground">{name}</dt>
                      <dd className="mt-1 font-mono text-sm">{formula}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <aside className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <strong>Notation:</strong> <span className="font-mono">r</span> = radius, <span className="font-mono">d</span> = diameter, <span className="font-mono">h</span> = perpendicular height, <span className="font-mono">n</span> = number of sides. The diameter is twice the radius: <span className="font-mono">d = 2r</span>.
          </aside>
        </section>

        <section id="angles" className="mt-12 scroll-mt-6">
          <p className="text-sm font-semibold text-primary">Know these relationships</p>
          <h2 className="mt-1 text-3xl font-bold">Angle facts</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {angleFacts.map(([name, fact]) => (
              <article key={name} className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">{name}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{fact}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="solving" className="mt-12 scroll-mt-6">
          <p className="text-sm font-semibold text-primary">A repeatable method</p>
          <h2 className="mt-1 text-3xl font-bold">How to solve a geometry problem</h2>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {problemSteps.map(([number, title, detail]) => (
              <li key={number} className="flex gap-4 rounded-lg border border-border p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{number}</span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-12 border-t border-border pt-5 text-sm text-muted-foreground">
          Tip: make a small sketch and write the formula before substituting numbers. That makes it easier to catch a wrong height, radius, or unit.
        </footer>
      </div>
    </main>
  );
}
