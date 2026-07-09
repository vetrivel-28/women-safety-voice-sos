# SafeHer Website

This is the official landing and APK download page for the SafeHer Android application. It is a lightweight, mobile-first website built with Next.js and Tailwind CSS.

## Getting Started Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy the example environment file and configure the URLs:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure:
   - `NEXT_PUBLIC_APK_URL`: The direct download link for the Android APK (e.g., GitHub Release asset URL). If left empty, the download buttons will be disabled.
   - `NEXT_PUBLIC_GITHUB_URL`: Link to the open-source repository.

3. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

4. **Build for production:**
   ```bash
   npm run build
   ```

## Deployment to Vercel

This project is optimized for deployment on Vercel.

1. **Push to GitHub:**
   Ensure this `website` directory is committed to your Git repository (e.g., `women-safety-voice-sos/website`).
   
   **IMPORTANT:** Do NOT commit the APK file into this repository. Vercel is not designed to host large binaries. The APK should be hosted on GitHub Releases or a similar platform, and linked via the environment variable.

2. **Import into Vercel:**
   - Go to [Vercel](https://vercel.com) and click **Add New Project**.
   - Import your repository.
   - In the "Framework Preset" ensure **Next.js** is selected.
   - In the "Root Directory" option, select the `website` directory if it's part of a monorepo.

3. **Configure Environment Variables:**
   During the Vercel import process, add the following Environment Variables:
   - `NEXT_PUBLIC_APK_URL` = (Your GitHub release APK URL)
   - `NEXT_PUBLIC_GITHUB_URL` = (Your repository URL)

4. **Deploy:**
   Click **Deploy**.

## Updating the APK URL

When you release a new version of the APK:
1. Go to your Vercel Project Settings > Environment Variables.
2. Update the value of `NEXT_PUBLIC_APK_URL`.
3. Go to the Deployments tab and click **Redeploy** on your latest deployment so the new environment variable takes effect.
