import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'chart.js';
import { Chart } from 'chart.js';
import { registerables } from 'chart.js';

// Make Chart.js available globally for MathChart (client-side rendering, zero AI tokens)
Chart.register(...registerables);
declare global {
  interface Window {
    Chart: typeof Chart;
  }
}
window.Chart = Chart;

createRoot(document.getElementById('root')!).render(<App />);
