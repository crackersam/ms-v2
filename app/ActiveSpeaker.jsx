import React, { useEffect, useRef } from "react";

const ActiveSpeaker = ({ consumer, audioConsumer, socket, speakerIndex }) => {
  const videoRef = useRef();
  const runOnce = useRef(false);
  const bgRef = useRef();
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
            speakerIndex.current += 1;
            bgRef.current.style.zIndex = speakerIndex.current - 1;
            videoRef.current.style.zIndex = speakerIndex.current;
          }
        }
      });
    }
  }, [audioConsumer]);
  return consumer ? (
    <div
      ref={bgRef}
      className="w-screen bg-black absolute top-0 left-0 h-[calc(100vh-200px)]"
    >
      <video
        className="relative top-0 left-[50%] h-full translate-x-[-50%] hidden"
        ref={videoRef}
        autoPlay
        muted
        playsInline
      />
    </div>
  ) : null;
};

export default ActiveSpeaker;
