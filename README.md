# 📈 TradeTrack: AI-Powered Stock Tracking Dashboard

TradeTrack is a modern, responsive, and AI-enhanced personal dashboard for tracking and analyzing your stock watchlist. Built with Next.js, Firebase, and Google's Genkit, it provides real-time data, insightful analytics, and a unique 3D visualization of your portfolio.

## ✨ Core Features

- **Centralized Dashboard**: Add, view, and manage your stock records with ease. The main dashboard provides a form for new entries and a comprehensive table of all tracked stocks.
- **Real-time Stock Data**: Fetches up-to-date stock prices and historical data using an integrated Yahoo Finance API proxy.
- **AI-Powered Watchlist Assistant**: Ask natural language questions about your portfolio (e.g., "Which of my stocks are near their target price?") and get instant answers.
- **3D Portfolio Galaxy**: An immersive 3D visualization of your watchlist where each stock is a unique planet. Planet size, color, and glow are determined by the stock's price and performance.
- **Stop-Loss Monitoring**: A dedicated page that automatically lists all stocks where the current price has fallen below your defined stop-loss level.
- **Financial Calculators**: Includes built-in tools for technical analysis:
  - **Gann Square of Nine**: Calculate key support and resistance levels.
  - **Retracement Calculator**: Find 1/3, 1/2, and 2/3 retracement levels.
- **Trading Journal**: A persistent, private journal to log your trading thoughts, strategies, and reflections, saved directly to your user profile in Firestore.
- **Customizable Theming**: Switch between light and dark modes, and choose from multiple color themes (Indigo, Slate, etc.) to personalize your experience.
- **Secure & Private**: Utilizes Firebase Anonymous Authentication and Firestore Security Rules to ensure each user's data is completely private and secure.

## 🚀 Technology Stack

- **Framework**: **Next.js 14** (App Router)
- **Language**: **TypeScript**
- **Authentication**: **Firebase Authentication** (Anonymous Sign-in)
- **Database**: **Cloud Firestore**
- **Generative AI**: **Google AI** with **Genkit**
- **Styling**: **Tailwind CSS**
- **UI Components**: **shadcn/ui** (Radix UI + Tailwind)
- **3D Visualization**: **React Three Fiber** & **Drei**
- **Forms**: **React Hook Form** with **Zod** for validation
- **Deployment**: Configured for **Firebase App Hosting**

## 🏁 Getting Started

### Prerequisites

- Node.js (v20 or later recommended)
- Firebase Account and a configured project

### Local Development

1.  **Clone the Repository**:
    ```bash
    git clone <your-repository-url>
    cd TradeTrack
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Firebase Configuration**:
    - This project is pre-configured to connect to a Firebase project via auto-initialization provided by Firebase App Hosting.
    - For local development, ensure your `src/firebase/config.ts` file contains your Firebase project's configuration keys.
    - Set up Firebase Authentication and enable "Anonymous" as a sign-in provider.
    - Set up Cloud Firestore and deploy the security rules from `firestore.rules`.

4.  **Run the Development Server**:
    The application and the Genkit AI flows run on separate processes.

    - **Start the Next.js app**:
      ```bash
      npm run dev
      ```
      This will run the web application, typically on `http://localhost:9002`.

    - **Start the Genkit AI server**:
      In a separate terminal, run:
      ```bash
      npm run genkit:watch
      ```
      This starts the Genkit development server, which makes the AI flows available to the application.

5.  **Open the App**:
    Navigate to `http://localhost:9002` in your browser to start using TradeTrack.

## 📁 Project Structure

- `src/app/`: Main application routes (pages) using the Next.js App Router.
- `src/components/`: Reusable React components, including UI components from shadcn/ui.
- `src/ai/`: Contains all Genkit-related code.
  - `src/ai/flows/`: Defines the AI flows for features like the watchlist assistant and risk assessment.
- `src/firebase/`: Firebase configuration, providers, and custom hooks (`useUser`, `useCollection`, `useDoc`).
- `src/lib/`: Utility functions and shared libraries (e.g., `stock-list.ts`).
- `public/`: Static assets.
- `firestore.rules`: Security rules for the Cloud Firestore database.
- `apphosting.yaml`: Configuration for deployment on Firebase App Hosting.