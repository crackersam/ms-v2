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
            videoRef.current.style.border = "5px solid red";
            videoRef.current.style.display = "block";
          } else {
            videoRef.current.style.border = "none";
            videoRef.current.style.display = "none";
          }
        }
      });
    }
  }, [audioConsumer]);
  return consumer ? (
    <video className="hidden" ref={videoRef} autoPlay controls playsInline />
  ) : null;
};

export default ActiveSpeaker;
