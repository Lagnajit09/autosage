import { useNavigate } from "react-router-dom";

const Logo = () => {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center gap-4 cursor-pointer"
      onClick={() => navigate("/")}
    >
      {/* Add Logo SVG */}

      <span className="text-xl md:text-2xl font-extrabold">
        <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent font-semibold">
          🇦🇺🇹🇴
        </span>
        <span className="text-gray-800 dark:text-white">🇸🇦🇬🇪</span>
      </span>
    </div>
  );
};

export default Logo;
