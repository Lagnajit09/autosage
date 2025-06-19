import Features from "@/components/landing/Features";
import Footer from "@/components/landing/Footer";
import Hero from "@/components/landing/Hero";

const Landing = () => {
  return (
    <div className="dark min-h-screen bg-gray-900">
      <Hero />
      <Features />
      <Footer />
    </div>
  );
};

export default Landing;
