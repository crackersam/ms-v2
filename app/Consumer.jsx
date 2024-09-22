import React, { useEffect, useRef } from "react";

const Consumer = ({ consumerTransport, socket }) => {
  const videoRef = useRef();
  const runOnce = useRef(false);
  useEffect(() => {
    if (runOnce.current) return;
    const { track } = consumerTransport.consumer;

    videoRef.current.srcObject = new MediaStream([track]);

    socket.emit("consumer-resume", {
      producerId: consumerTransport.producerId,
    });
    runOnce.current = true;
  }, []);
  return consumerTransport ? (
    <div className="flex flex-col w-1/5">
      <video ref={videoRef} autoPlay controls playsInline />
      <div className="text-black bg-white">{consumerTransport.producerId}</div>
    </div>
  ) : null;
};

export default Consumer;
