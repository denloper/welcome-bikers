import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { CategoryGlyph } from "../components/Icons";
import { CATEGORIES } from "../lib/categories";
import { BANNERS } from "../lib/photos";

export function Main() {
  const nav = useNavigate();
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % BANNERS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const banner = BANNERS[slide];

  return (
    <div className="page home">
      <div className="logo-wrap">
        <BrandLogo />
      </div>

      <button className="banner" onClick={() => nav(banner.to)}>
        <img src={banner.image} alt="" />
        {banner.title ? <h2>{banner.title}</h2> : null}
        <div className="dots">
          {BANNERS.map((_, i) => (
            <i key={i} className={i === slide ? "on" : ""} />
          ))}
        </div>
      </button>

      <div className="grid">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className="cat"
            onClick={() => {
              if (c.id === "add") nav("/add");
              else if (c.id === "help") nav("/help");
              else if (c.id === "routes") nav("/routes");
              else nav(`/objects/${c.id}`);
            }}
          >
            <CategoryGlyph id={c.id} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
