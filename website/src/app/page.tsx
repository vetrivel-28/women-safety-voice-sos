import Link from "next/link";
import { appConfig } from "@/config/app";
import { 
  Shield, 
  ShieldAlert, 
  Mic, 
  Users, 
  MapPin, 
  Heart, 
  FileText, 
  Download,
  Smartphone,
  CircleCheck,
  TriangleAlert
} from "lucide-react";

export default function Home() {
  const hasApkUrl = appConfig.apkUrl && appConfig.apkUrl !== "#" && appConfig.apkUrl !== "";

  return (
    <div className="relative min-h-screen bg-background overflow-hidden selection:bg-primary/30">
      {/* Background radial gradient */}
      <div className="absolute inset-0 bg-gradient-radial -z-10" />

      {/* 1. TOP NAVIGATION */}
      <header className="sticky top-0 z-50 glass border-b-0 border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 p-1.5 rounded-lg border border-primary/20 text-primary">
                <Shield className="w-5 h-5 fill-primary/20" />
              </div>
              <span className="font-semibold text-lg tracking-tight">{appConfig.name}</span>
            </div>
            
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
              <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
              <Link href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
              <Link href="#download" className="hover:text-foreground transition-colors">Download</Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link href="#download" className="md:hidden text-sm font-medium text-primary hover:text-primary-hover">
                Get App
              </Link>
              <a 
                href={hasApkUrl ? appConfig.apkUrl : "#download"}
                className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  hasApkUrl 
                    ? "bg-primary text-primary-foreground hover:bg-primary-hover hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)]" 
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Download className="w-4 h-4" />
                {hasApkUrl ? "Download APK" : "Coming Soon"}
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-col flex items-center w-full">
        {/* 2. HERO SECTION */}
        <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24 flex flex-col lg:flex-row items-center gap-12 lg:gap-8">
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-medium text-primary mb-6 border border-primary/20">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Android App</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-balance leading-tight">
              Safety, when every <span className="text-primary">second matters.</span>
            </h1>
            
            <p className="text-muted-foreground text-lg mb-8 max-w-xl text-balance">
              Emergency assistance, trusted connections, and safety tools designed to help you act quickly when it matters most.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <a 
                href={hasApkUrl ? appConfig.apkUrl : "#"}
                className={`flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 rounded-full font-medium transition-all ${
                  hasApkUrl 
                    ? "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-[0_0_30px_rgba(220,38,38,0.4)] active:scale-95" 
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Download className="w-5 h-5" />
                {hasApkUrl ? "Download APK" : "Download coming soon"}
              </a>
              <Link 
                href="#features" 
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 rounded-full font-medium glass hover:bg-white/5 transition-colors"
              >
                View Features
              </Link>
            </div>
            
            <div className="flex items-center gap-4 mt-6 text-xs text-muted-foreground">
              <span>Version {appConfig.version}</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Android Only</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>~{appConfig.apkSize}</span>
            </div>
          </div>

          {/* 3. APP PREVIEW (CSS Mockup) */}
          <div className="flex-1 flex justify-center lg:justify-end w-full relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[100px] -z-10" />
            
            <div className="phone-mockup relative bg-[#121214] flex flex-col">
              <div className="phone-notch" />
              
              <div className="flex-1 p-5 pt-12 flex flex-col gap-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-sm">SafeHer</span>
                  </div>
                  <div className="text-[10px] text-green-400 font-medium px-2 py-1 bg-green-400/10 rounded-full">
                    Protected
                  </div>
                </div>

                {/* Big SOS Button */}
                <div className="flex-1 flex items-center justify-center py-4">
                  <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center p-2 relative animate-pulse">
                    <div className="absolute inset-0 rounded-full border border-primary/30" />
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.5)]">
                      <span className="text-white font-bold text-2xl tracking-widest">SOS</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <MapPin className="w-4 h-4 text-primary mb-2" />
                    <div className="text-[10px] text-muted-foreground">Location</div>
                    <div className="text-xs font-medium">Sharing Active</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <Users className="w-4 h-4 text-primary mb-2" />
                    <div className="text-[10px] text-muted-foreground">Contacts</div>
                    <div className="text-xs font-medium">3 Trusted</div>
                  </div>
                </div>

                <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center gap-3">
                  <div className="bg-primary/20 p-2 rounded-xl">
                    <Mic className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-medium">Voice Trigger</div>
                    <div className="text-[10px] text-muted-foreground">Listening for hotword</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. FEATURES SECTION */}
        <section id="features" className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-20 border-t border-border/50">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 tracking-tight">Built for Critical Moments</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Every feature is designed to be accessible quickly and reliably when you need it most.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<ShieldAlert />}
              title="Emergency SOS"
              description="Quickly trigger an emergency workflow when help is needed."
            />
            <FeatureCard 
              icon={<Mic />}
              title="Voice Safety Support"
              description="Voice-assisted safety workflows designed for urgent situations."
            />
            <FeatureCard 
              icon={<Users />}
              title="Trusted Contacts"
              description="Keep selected family members and trusted people connected."
            />
            <FeatureCard 
              icon={<MapPin />}
              title="Live Location Support"
              description="Share relevant location information during active safety situations."
            />
            <FeatureCard 
              icon={<Heart />}
              title="Family Safety"
              description="Support coordinated safety awareness among trusted members."
            />
            <FeatureCard 
              icon={<FileText />}
              title="Profile & Safety Info"
              description="Keep important personal and emergency information available."
            />
          </div>
        </section>

        {/* 5. HOW IT WORKS & 7. INSTALLATION GUIDE */}
        <section id="how-it-works" className="w-full bg-[#121214]/50 border-y border-border/50">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-20 grid md:grid-cols-2 gap-16 items-start">
            
            <div>
              <h2 className="text-3xl font-bold mb-8 tracking-tight">How it works</h2>
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[15px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:to-transparent">
                <Step 
                  number="1"
                  title="Download SafeHer"
                  description="Get the APK file directly from our secure servers."
                />
                <Step 
                  number="2"
                  title="Install the APK on Android"
                  description="Open the file and follow your device's installation prompts."
                />
                <Step 
                  number="3"
                  title="Set up your profile"
                  description="Configure your trusted safety network and emergency preferences."
                />
              </div>
            </div>

            <div className="glass p-6 sm:p-8 rounded-3xl">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Installation Guide
              </h3>
              <ol className="space-y-4 text-sm text-muted-foreground relative border-l border-border/50 ml-2 pl-6">
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-primary" />
                  Download the APK file using the link below.
                </li>
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-primary" />
                  Open the downloaded file from your notifications or file manager.
                </li>
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-primary" />
                  If Android blocks installation, tap <strong>Settings</strong> on the prompt.
                </li>
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-primary" />
                  Toggle on <strong>Allow from this source</strong> for your browser/file manager.
                </li>
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-primary" />
                  Return to the prompt and tap <strong>Install</strong>.
                </li>
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-primary" />
                  Open the app and complete your safety setup.
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* 6. DOWNLOAD SECTION */}
        <section id="download" className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-24 text-center">
          <div className="glass max-w-2xl mx-auto p-8 sm:p-12 rounded-[40px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10 group-hover:bg-primary/20 transition-colors duration-700" />
            
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-6 border border-primary/20">
              <Download className="w-8 h-8 text-primary" />
            </div>
            
            <h2 className="text-3xl font-bold mb-2 tracking-tight">Get SafeHer for Android</h2>
            
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mb-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CircleCheck className="w-4 h-4 text-primary" /> Version {appConfig.version}</span>
              <span className="flex items-center gap-1.5"><CircleCheck className="w-4 h-4 text-primary" /> APK Format</span>
              <span className="flex items-center gap-1.5"><CircleCheck className="w-4 h-4 text-primary" /> ~{appConfig.apkSize}</span>
              <span className="flex items-center gap-1.5 font-mono text-xs bg-white/5 px-2 py-1 rounded">{appConfig.packageId}</span>
            </div>

            <a 
              href={hasApkUrl ? appConfig.apkUrl : "#"}
              className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold text-lg transition-all w-full sm:w-auto mb-6 ${
                hasApkUrl 
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(220,38,38,0.4)]" 
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Download className="w-5 h-5" />
              {hasApkUrl ? "Download APK" : "Download coming soon"}
            </a>

            <div className="space-y-3 text-xs text-muted-foreground max-w-md mx-auto">
              <p className="flex items-start gap-2 text-left">
                <TriangleAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Android may ask you to allow installation from this source because the app is distributed directly as an APK.</span>
              </p>
              <p className="flex items-start gap-2 text-left">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Only install APK files from a link you trust.</span>
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* 8. PRIVACY / SAFETY NOTE & 9. FOOTER */}
      <footer className="w-full bg-[#0a0a0c] border-t border-border/50 py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground mb-12 text-balance leading-relaxed">
            <strong className="text-foreground">Safety Note:</strong> SafeHer is designed as a safety-support application. Availability of emergency, network, location, notification, and background features may depend on device permissions, connectivity, Android version, battery settings, and service availability.
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/20">
                <Shield className="w-4 h-4 text-primary fill-primary/20" />
              </div>
              <span className="font-semibold">{appConfig.name}</span>
              <span className="text-muted-foreground hidden sm:inline-block ml-2 border-l border-border pl-2">
                Built for faster access to safety tools.
              </span>
            </div>

            <div className="flex items-center gap-6 text-muted-foreground">
              <span>Version {appConfig.version}</span>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <a href={appConfig.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass p-6 rounded-3xl hover:bg-white/5 transition-colors group">
      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4 border border-primary/20 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function Step({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="relative pl-10 md:pl-0">
      <div className="md:hidden absolute left-0 top-1 w-8 h-8 rounded-full bg-[#121214] border border-primary/30 flex items-center justify-center text-sm font-bold text-primary z-10">
        {number}
      </div>
      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 -top-1 w-8 h-8 rounded-full bg-[#121214] border border-primary/30 items-center justify-center text-sm font-bold text-primary z-10 shadow-[0_0_15px_rgba(220,38,38,0.2)]">
        {number}
      </div>
      <div className="md:pt-10 md:text-center">
        <h4 className="text-lg font-bold mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
