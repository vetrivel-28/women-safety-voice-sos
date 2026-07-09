import Link from "next/link";
import { appConfig } from "@/config/app";
import { Shield, ArrowLeft } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: `Privacy Policy | ${appConfig.name}`,
  description: "Privacy policy and data usage information for the SafeHer application.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/30 pb-20">
      <header className="border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{appConfig.name}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-12">
        <div className="glass p-8 sm:p-12 rounded-3xl">
          <h1 className="text-3xl font-bold mb-2 tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>

          <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
              <p>
                This Privacy Policy outlines how {appConfig.name} collects, uses, and protects your information. 
                Our application is designed as a safety-support tool, and we only request permissions necessary to provide these safety features.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">2. Permissions and Data Usage</h2>
              <p>To function effectively during critical moments, the app requires specific device permissions:</p>
              <ul className="list-disc pl-5 space-y-2 text-foreground/80">
                <li>
                  <strong className="text-foreground">Location (Background & Foreground):</strong> Required to share your live location with your trusted contacts during an active SOS session.
                </li>
                <li>
                  <strong className="text-foreground">Microphone:</strong> Used solely for the voice-triggered safety support feature (listening for emergency hotwords). Audio is processed locally when possible and is not used for advertising.
                </li>
                <li>
                  <strong className="text-foreground">Contacts:</strong> Accessed locally to allow you to select and configure your trusted safety network. We do not upload your entire contact list to our servers.
                </li>
                <li>
                  <strong className="text-foreground">SMS & Phone:</strong> Used to automatically send emergency alerts and initiate calls to your designated trusted contacts when SOS is triggered.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">3. Data Storage and Security</h2>
              <p>
                Your personal profile and emergency information are transmitted securely to our backend services to coordinate alerts. 
                We implement standard security measures to protect this data. We do not sell your personal information to third parties.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">4. Limitations of Service</h2>
              <p>
                {appConfig.name} is a supportive safety tool, not a replacement for official emergency services (like 911 or local police). 
                The availability and reliability of features depend heavily on your device&apos;s battery, network connectivity, GPS signal, and operating system restrictions. 
                We cannot guarantee immediate rescue or emergency response.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">5. Contact Us</h2>
              <p>
                If you have questions about this privacy policy or our data practices, please contact us at: <br />
                <a href="mailto:vetri282006@gmail.com" className="text-primary hover:underline">vetri282006@gmail.com</a>
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
