import React, { useEffect, useRef } from "react";

const ActiveSpeaker = ({ consumer, audioConsumer, socket }) => {
  const videoRef = useRef();
  const runOnce = useRef(false);
  useEffect(() => {
    if (runOnce.current) return;
    const { track } = consumer.consumer;

    videoRef.current.srcObject = new MediaStream([track]);

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
            videoRef.current.style.display = "block";
            videoRef.current.style.zIndex = "1";
          } else {
            videoRef.current.style.zIndex = "-1";
          }
        }
      });
    }
  }, [audioConsumer]);
  return consumer ? (
    <div className="width-screen bg-black">
      <video
        className="absolute top-0 left-[50%] h-[calc(100vh-200px)] translate-x-[-50%] hidden"
        ref={videoRef}
        autoPlay
        playsInline
      />
    </div>
  ) : null;
};

export default ActiveSpeaker;
