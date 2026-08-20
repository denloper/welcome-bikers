import { useNavigate } from "react-router-dom";
import { RealBro } from "../components/Assistant";
import { BrandLogo } from "../components/BrandLogo";
import { CategoryGlyph } from "../components/Icons";
import { CATEGORIES } from "../lib/categories";
import { HERO } from "../lib/photos";

export function Main() {
  const nav = useNavigate();

  return (
    <div className="page home">
      <div className="logo-wrap">
        <BrandLogo />
      </div>

      <button className="banner" onClick={() => nav(HERO.to)}>
        <img src={HERO.image} alt="" />
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

      <RealBro />
    </div>
  );
}
