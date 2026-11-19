import Image from "next/image";

export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/assets/images/logokriscent.webp"
      alt="Kriscent"
      width={164}
      height={40}
      priority={priority}
      className={className ?? "h-10 w-auto"}
    />
  );
}
