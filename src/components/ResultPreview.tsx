"use client";

interface ResultPreviewProps {
  beforeImageUrl: string | null;
  finalImageUrl: string | null;
}

export function ResultPreview({
  beforeImageUrl,
  finalImageUrl,
}: ResultPreviewProps) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-stone-950">
          Before and After
        </h2>
        {finalImageUrl ? (
          <a
            className="rounded-md bg-stone-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
            download="glassfit-visualization.png"
            href={finalImageUrl}
          >
            Download Final Image
          </a>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PreviewFrame imageUrl={beforeImageUrl} label="Before" />
        <PreviewFrame imageUrl={finalImageUrl} label="Final Output" />
      </div>
    </section>
  );
}

interface PreviewFrameProps {
  imageUrl: string | null;
  label: string;
}

function PreviewFrame({ imageUrl, label }: PreviewFrameProps) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-stone-50">
      <div className="border-b border-stone-200 px-3 py-2 text-sm font-medium text-stone-700">
        {label}
      </div>
      <div className="flex min-h-48 items-center justify-center p-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={label}
            className="max-h-80 w-full object-contain"
            src={imageUrl}
          />
        ) : (
          <span className="text-sm text-stone-500">No image generated</span>
        )}
      </div>
    </div>
  );
}

