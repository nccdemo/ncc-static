import { Link } from "react-router-dom";
import { getStoredReferralCode } from "../utils/referralStorage.js";

const BG = "/images/sfondo.png";
const IMG_TESTI = "/images/testi.svg";
const IMG_TRANSFER = "/images/bottone-transfer.svg";
const IMG_ESCURSIONI = "/images/bottone-escursioni.svg";
const IMG_ICONE_BASSE = "/images/icone-basse.svg";

function toursHomeHref() {
  const ref = getStoredReferralCode();
  return ref ? `/?ref=${encodeURIComponent(ref)}` : "/";
}

export default function ExplorePage() {
  const toursHref = toursHomeHref();
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-md overflow-hidden bg-neutral-900">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${BG}')` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/50" aria-hidden />

      <div className="relative z-10 flex min-h-screen flex-col pb-36">
        <div className="mt-10 flex justify-center px-4">
          <img
            src={IMG_TESTI}
            alt=""
            className="h-auto w-full max-w-[min(100%,320px)] object-contain"
            width={320}
            height={120}
          />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <Link
            to="/transfer"
            className="block w-full max-w-[320px] cursor-pointer transition duration-200 hover:scale-105"
          >
            <img
              src={IMG_TRANSFER}
              alt="Prenota transfer"
              className="block h-auto w-full object-contain"
              width={320}
              height={80}
            />
          </Link>
          <Link
            to={toursHref}
            className="block w-full max-w-[320px] cursor-pointer transition duration-200 hover:scale-105"
          >
            <img
              src={IMG_ESCURSIONI}
              alt="Vedi escursioni"
              className="block h-auto w-full object-contain"
              width={320}
              height={80}
            />
          </Link>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 w-full bg-white py-5">
        <div className="mx-auto flex w-full max-w-md justify-center px-4">
          <img
            src={IMG_ICONE_BASSE}
            alt=""
            className="h-auto w-full object-contain object-bottom"
            width={400}
            height={120}
          />
        </div>
      </div>
    </div>
  );
}
