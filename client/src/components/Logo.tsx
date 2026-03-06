import { useNavigate } from "react-router-dom";

const Logo = () => {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center gap-2 cursor-pointer"
      onClick={() => navigate("/")}
    >
      <img
        src="/logo.png"
        alt="AutoSage Logo"
        className="h-8 w-auto object-contain"
      />
      <p className="text-gray-950 dark:text-gray-100 font-bold text-xl tracking-tight leading-tight">
        AUTOSAGE
      </p>
    </div>
  );
};

export default Logo;
