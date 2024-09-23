import React, { useEffect, useRef } from "react";

const Consumer = ({ consumer, socket }) => {
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
  return consumer ? (
    <div className="flex flex-col w-1/5">
      <video ref={videoRef} autoPlay controls playsInline />
      <div className="text-black bg-white">{consumer.producerId}</div>
    </div>
  ) : null;
};

export default Consumer;
