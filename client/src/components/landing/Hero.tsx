import { Button } from "@/components/ui/button";
import { ArrowDown, Play } from "lucide-react";
import { useEffect, useState } from "react";
import Logo from "../Logo";
import { Link } from "react-router-dom";

const Hero = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 bg-gray-900">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/30 rounded-full mix-blend-lighten filter blur-xl opacity-70 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-600/30 rounded-full mix-blend-lighten filter blur-xl opacity-70 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-60 h-60 bg-pink-600/30 rounded-full mix-blend-lighten filter blur-xl opacity-70 animate-pulse animation-delay-4000"></div>
      </div>

      {/* Logo */}
      <div className="absolute top-0 w-[100%] px-8 py-4 flex justify-between items-center">
        <Logo />
        <div className="flex gap-4">
          <Link to={"/signup"} className="p-[3px] relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg" />
            <div className="px-8 py-2  bg-black rounded-[6px]  relative group transition duration-200 text-white hover:bg-transparent">
              SIGN UP
            </div>
          </Link>

          <Link
            to={"/signin"}
            className="px-6 py-2 bg-transparent border border-black dark:border-white dark:text-white text-black rounded-lg font-medium transform hover:-translate-y-1 transition duration-400 outline-none"
          >
            SIGN IN
          </Link>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div
          className={`transform transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
          }`}
        >
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Design. Script.
            </span>
            <br />
            <span className="text-white">Automate.</span>
          </h1>

          <p className="text-xl md:text-xl text-gray-400 mb-8 max-w-3xl mx-auto leading-relaxed">
            Script automation made visual. Build powerful workflows with
            drag-and-drop simplicity.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 mb-12">
            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            >
              Start Building Free
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-2 border-gray-600 text-gray-300 hover:bg-gray-800 px-8 py-4 text-lg font-semibold transition-all duration-300"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch Demo
            </Button>
          </div>

          <div className="text-sm text-gray-400 mb-8">
            ✨ AI Generation • 🚀 Remote Execution • 🔒 Enterprise ready
          </div>

          {/* Demo Preview */}
          <div className="relative max-w-4xl mx-auto">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-gray-700">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <div className="ml-4 text-sm text-gray-400">autogen.app</div>
              </div>
              <div className="relative h-64 rounded-lg overflow-hidden flex items-center justify-center">
                {/* Background Image with Blur */}
                <div className="absolute inset-0 bg-[url('../../../public/workflow-2.png')] bg-no-repeat bg-cover bg-center blur-sm"></div>

                {/* Optional Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800/50 to-gray-700/50"></div>

                {/* Foreground Content */}
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl mx-auto mb-4 flex items-center justify-center">
                    <div className="w-8 h-8 bg-white rounded-lg"></div>
                  </div>
                  <p className="text-gray-300 font-medium">
                    Visual Workflow Builder
                  </p>
                  <p className="text-sm text-gray-400">Drag, drop, automate</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ArrowDown className="w-6 h-6 text-gray-400" />
        </div>
      </div>
    </section>
  );
};

export default Hero;
