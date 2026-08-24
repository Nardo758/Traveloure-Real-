import Image from "next/image";
import { Button } from "../../components/ui/button";
const offersData = [
  {
    section: "Best Deals",
    items: [
      {
        logo: "/airalo.png",
        discount: "15% Off",
        details: "New users only. Valid until November 30.",
        cta: "CLICK HERE",
      },
      {
        logo: "/airalo.png",
        discount: "10% off",
        details: "For airalo Plus subscription only.",
        cta: "AHTRP59",
      },
      {
        logo: "/airalo.png",
        discount: "10% off",
        details: "For airalo Plus subscription only.",
        cta: "AHTRP59",
      },
      {
        logo: "/airalo.png",
        discount: "15% Off",
        details: "New users only. Valid until November 30.",
        cta: "CLICK HERE",
      },
    ],
  },
  {
    section: "Insurance",
    items: [
      {
        logo: "/airalo.png",
        discount: "15% Off",
        details: "New users only. Valid until November 30.",
        cta: "CLICK HERE",
      },
      {
        logo: "/airalo.png",
        discount: "10% off",
        details: "For airalo Plus subscription only.",
        cta: "AHTRP59",
      },
      {
        logo: "/airalo.png",
        discount: "10% off",
        details: "For airalo Plus subscription only.",
        cta: "AHTRP59",
      },
      {
        logo: "/airalo.png",
        discount: "15% Off",
        details: "New users only. Valid until November 30.",
        cta: "CLICK HERE",
      },
    ],
  },
  {
    section: "Tours & Activities",
    items: [
      {
        logo: "/airalo.png",
        discount: "15% Off",
        details: "New users only. Valid until November 30.",
        cta: "CLICK HERE",
      },
      {
        logo: "/airalo.png",
        discount: "10% off",
        details: "For airalo Plus subscription only.",
        cta: "AHTRP59",
      },
      {
        logo: "/airalo.png",
        discount: "10% off",
        details: "For airalo Plus subscription only.",
        cta: "AHTRP59",
      },
      {
        logo: "/airalo.png",
        discount: "15% Off",
        details: "New users only. Valid until November 30.",
        cta: "CLICK HERE",
      },
    ],
  },
];

export default function DealsOffersPage() {
  return (
    <div className="  pb-10">
   <div className="w-full bg-[url('/dealsbgimage.png')] bg-cover bg-center py-12">
  <div className="text-center max-w-3xl mx-auto px-4">
    <h2 className="text-3xl font-bold text-black">
      Best <span className="text-green-600">Deals</span> And <span className="text-green-500">Offers</span>
    </h2>
    <p className="text-sm text-gray-700 mt-2">
      Plan your perfect trip with personalized suggestions, easy itineraries, and real-time travel tips.
    </p>
  </div>
</div>

      {offersData.map((section, index) => (
        <div key={index} className=" container mx-auto mt-5 px-4 mb-8">
          <h3 className="text-xl font-semibold mb-4">{section.section}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between border rounded-xl p-4 shadow-sm bg-white"
              >
                <div className="flex items-center gap-4">
                  <Image src={item.logo} alt="logo" width={60} height={60} className="object-contain bg-[#E8EAF280] p-1" />
                  <div>
                    <h4 className="font-bold text-lg">{item.discount}</h4>
                    <p className="text-sm text-gray-500">{item.details}</p>
                  </div>
                </div>
                <Button variant="secondary" className="text-xs font-semibold px-4 py-2">
                  {item.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
