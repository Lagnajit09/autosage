const Logo = () => {
  return (
    <div className="flex items-center gap-4">
      {/* Add Logo SVG */}

      <span className="text-xl md:text-2xl font-extrabold">
        <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Auto
        </span>
        <span className="text-white">Ꮆen</span>
      </span>
    </div>
  );
};

export default Logo;
