"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { isIosLike } from "@/lib/client/isIosDevice";

type ScannerCameraFeedProps = {
  className?: string;
};

/**
 * On iOS Safari, live &lt;video&gt; renders in a native layer above HTML overlays.
 * We mirror frames to a canvas for display; qr-scanner still reads the hidden video.
 */
export const ScannerCameraFeed = forwardRef<HTMLVideoElement, ScannerCameraFeedProps>(
  function ScannerCameraFeed(_props, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [iosMirror, setIosMirror] = useState(false);

    useEffect(() => {
      setIosMirror(isIosLike());
    }, []);

    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
    }, []);

    useEffect(() => {
      if (!iosMirror) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      let raf = 0;

      const drawCover = () => {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return;

        const rect = canvas.getBoundingClientRect();
        const cw = rect.width;
        const ch = rect.height;
        if (cw < 2 || ch < 2) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const bufW = Math.round(cw * dpr);
        const bufH = Math.round(ch * dpr);
        if (canvas.width !== bufW || canvas.height !== bufH) {
          canvas.width = bufW;
          canvas.height = bufH;
        }

        const videoAspect = vw / vh;
        const canvasAspect = cw / ch;
        let sx = 0;
        let sy = 0;
        let sw = vw;
        let sh = vh;

        if (videoAspect > canvasAspect) {
          sw = Math.round(vh * canvasAspect);
          sx = Math.round((vw - sw) / 2);
        } else {
          sh = Math.round(vw / canvasAspect);
          sy = Math.round((vh - sh) / 2);
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, bufW, bufH);
      };

      const tick = () => {
        drawCover();
        raf = requestAnimationFrame(tick);
      };

      const start = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      };

      video.addEventListener("loadedmetadata", start);
      video.addEventListener("playing", start);
      video.addEventListener("resize", start);
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) start();

      const ro = new ResizeObserver(() => drawCover());
      ro.observe(canvas);

      return () => {
        video.removeEventListener("loadedmetadata", start);
        video.removeEventListener("playing", start);
        video.removeEventListener("resize", start);
        ro.disconnect();
        cancelAnimationFrame(raf);
      };
    }, [iosMirror]);

    return (
      <>
        <video
          ref={videoRef}
          className={
            iosMirror
              ? "cq-scanner-camera-video cq-scanner-camera-video--ios-source"
              : "cq-scanner-camera-video"
          }
          muted
          playsInline
        />
        {iosMirror ? (
          <canvas
            ref={canvasRef}
            className="cq-scanner-camera-canvas pointer-events-none absolute inset-0 z-[1] h-full w-full"
            aria-hidden
          />
        ) : null}
      </>
    );
  },
);
