"use client";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradeMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
}

interface CandlestickChartProps {
  candles: Candle[];
  markers?: TradeMarker[];
  height?: number;
}

export function CandlestickChart({ candles, markers = [], height = 500 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        textColor: "#a0a0a0",
        background: { type: ColorType.Solid, color: "transparent" },
      },
      grid: {
        vertLines: { color: "#1a1a2e" },
        horzLines: { color: "#1a1a2e" },
      },
      width: containerRef.current.clientWidth,
      height,
      crosshair: { mode: 0 },
      timeScale: {
        borderColor: "#1a1a2e",
      },
      rightPriceScale: {
        borderColor: "#1a1a2e",
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    series.setData(
      candles.map((c) => ({
        ...c,
        time: c.time as UTCTimestamp,
      })),
    );

    if (markers.length > 0) {
      createSeriesMarkers(
        series,
        markers.map((m) => ({
          ...m,
          time: m.time as UTCTimestamp,
        })),
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, markers, height]);

  return <div ref={containerRef} className="w-full" />;
}
