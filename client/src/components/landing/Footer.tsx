import Logo from "../Logo";

const Footer = () => {
  return (
    <footer className="w-full bg-gray-800 rounded-t-3xl text-white px-6 md:px-16 py-10 relative overflow-hidden">
      {/* Gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-700/30 via-blue-500/20 to-transparent blur-3xl opacity-30 pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
        {/* Logo & Text */}
        <Logo />
        {/* Description */}
        <div className="text-center md:text-left text-gray-400 max-w-md">
          <p>Build powerful automations effortlessly with Autogen </p>
          <p>where visual scripting meets AI</p>
        </div>

        {/* Links */}
        <div className="flex gap-8">
          <a
            href="#"
            className="text-sm text-gray-300 hover:text-white transition border-b border-transparent hover:border-gray-400"
          >
            Terms & Conditions
          </a>
          <a
            href="#"
            className="text-sm text-gray-300 hover:text-white transition border-b border-transparent hover:border-gray-400"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
