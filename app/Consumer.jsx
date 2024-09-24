import React, { useEffect, useRef } from "react";

const Consumer = ({ consumer, audioConsumer, socket }) => {
  const videoRef = useRef();
  const runOnce = useRef(false);
  useEffect(() => {
    if (runOnce.current) return;
    const { track } = consumer.consumer;

    videoRef.current.srcObject = new MediaStream([track]);

    socket.emit("consumer-resume", {
      producerId: consumer.producerId,
    });
    runOnce.current = true;
  }, []);
  useEffect(() => {
    if (audioConsumer) {
      const { track } = audioConsumer.consumer;
      videoRef.current.srcObject.addTrack(track);
      socket.emit("consumer-resume", {
        producerId: audioConsumer.producerId,
      });
    }
  }, [audioConsumer]);
  return consumer ? (
    <div className="flex flex-col w-1/5 rounded-md m-2 border-slate-400 border-[3px]">
      <video ref={videoRef} autoPlay controls playsInline />
      <div className="text-black bg-white">{consumer.producerId}</div>
    </div>
  ) : null;
};

export default Consumer;
