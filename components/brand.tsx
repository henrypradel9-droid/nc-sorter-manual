import Image from "next/image";
export function Brand() {
  return (
    <div className="brand">
        <Image
          unoptimized
          src="/mercado-livre-oficial.png"
          width={921}
          height={237}
          alt="Mercado Livre"
          className="official-logo"
        />
      <div>
        <strong>NC SORTER</strong>
        <small>CONTROLE OPERACIONAL</small>
      </div>
    </div>
  );
}
