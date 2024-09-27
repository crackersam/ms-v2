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
      socket.on("activeSpeaker", (data) => {
        const activeSpeakerId = data.producerId;
        // Highlight or enlarge the video feed of the active speaker
        if (videoRef.current) {
          if (activeSpeakerId === audioConsumer.producerId) {
            videoRef.current.style.border = "5px solid red";
          } else {
            videoRef.current.style.border = "none";
          }
        }
      });
    }
  }, [audioConsumer]);
  return consumer ? (
    <div className="flex flex-col w-[200px] rounded-md m-2 border-slate-400 border-[3px]">
      <video ref={videoRef} autoPlay controls playsInline />
    </div>
  ) : null;
};

export default Consumer;
