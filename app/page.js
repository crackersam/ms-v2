"use client";
import React, { useEffect } from "react";
import { socket } from "@/socket";
import * as mediasoup from "mediasoup-client";

const Home = () => {
  const localVideo = React.useRef(null);
  const remoteVideo = React.useRef(null);
  const rtpCapabilities = React.useRef(null);
  const params = React.useRef({
    // mediasoup params
    encodings: [
      {
        rid: "r0",
        maxBitrate: 100000,
        scalabilityMode: "S3T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S3T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S3T3",
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  });
  const device = React.useRef(null);
  const producerTransport = React.useRef(null);
  const producer = React.useRef(null);
  const consumerTransport = React.useRef(null);
  const consumer = React.useRef(null);
  const isProducer = React.useRef(false);
  useEffect(() => {
    socket.on("connection-success", ({ socketId, existsProducer }) => {
      console.log(`Connected with socketId: ${socketId}, ${existsProducer}`);
    });
  }, []);

  const getLocalStream = () => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideo.current.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        params.current.track = track;
        goConnect(true);
      })
      .catch((err) => {
        console.error(err);
      });
  };
  const goConsume = () => {
    goConnect(false);
  };

  const goConnect = (producerOrConsumer) => {
    isProducer.current = producerOrConsumer;
    !device.current ? getRtpCapabilities() : goCreateTransport();
  };

  const goCreateTransport = () => {
    isProducer.current ? createSendTransport() : createRecvTransport();
  };

  const getRtpCapabilities = async () => {
    socket.emit("createRoom", (data) => {
      console.log(data);
      rtpCapabilities.current = data.rtpCapabilities;
      createDevice();
    });
  };

  const createDevice = async () => {
    device.current = new mediasoup.Device();
    await device.current.load({
      routerRtpCapabilities: rtpCapabilities.current,
    });
    console.log(device.current.rtpCapabilities);
    goCreateTransport();
  };

  const createSendTransport = () => {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    // this is a call from Producer, so sender = true
    socket.emit("createWebRtcTransport", { sender: true }, ({ params }) => {
      // The server sends back params needed
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error);
        return;
      }

      console.log(params);

      // creates a new WebRTC Transport to send media
      // based on the server's producer transport params
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
      producerTransport.current = device.current.createSendTransport(params);

      // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
      // this event is raised when a first call to transport.produce() is made
      // see connectSendTransport() below
      producerTransport.current.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            // Signal local DTLS parameters to the server side transport
            // see server's socket.on('transport-connect', ...)
            await socket.emit("transport-connect", {
              dtlsParameters,
            });

            // Tell the transport that parameters were transmitted.
            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransport.current.on(
        "produce",
        async (parameters, callback, errback) => {
          console.log(parameters);

          try {
            // tell the server to create a Producer
            // with the following parameters and produce
            // and expect back a server side producer id
            // see server's socket.on('transport-produce', ...)
            await socket.emit(
              "transport-produce",
              {
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData,
              },
              ({ id }) => {
                // Tell the transport that parameters were transmitted and provide it with the
                // server side producer's id.
                callback({ id });
              }
            );
          } catch (error) {
            errback(error);
          }
        }
      );
      connectSendTransport();
    });
  };

  const connectSendTransport = async () => {
    // we now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    producer.current = await producerTransport.current.produce(params.current);

    producer.current.on("trackended", () => {
      console.log("track ended");

      // close video track
    });

    producer.current.on("transportclose", () => {
      console.log("transport ended");

      // close video track
    });
  };

  const createRecvTransport = async () => {
    // see server's socket.on('consume', sender?, ...)
    // this is a call from Consumer, so sender = false
    await socket.emit(
      "createWebRtcTransport",
      { sender: false },
      ({ params }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }

        console.log(params);

        // creates a new WebRTC Transport to receive media
        // based on server's consumer transport params
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
        consumerTransport.current = device.current.createRecvTransport(params);

        // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
        // this event is raised when a first call to transport.produce() is made
        // see connectRecvTransport() below
        consumerTransport.current.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await socket.emit("transport-recv-connect", {
                dtlsParameters,
              });

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error) {
              // Tell the transport that something was wrong
              errback(error);
            }
          }
        );
        connectRecvTransport();
      }
    );
  };

  const connectRecvTransport = async () => {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device.current.rtpCapabilities,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume");
          return;
        }

        console.log(params);
        // then consume with the local consumer transport
        // which creates a consumer
        consumer.current = await consumerTransport.current.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        // destructure and retrieve the video track from the producer
        const { track } = consumer.current;

        remoteVideo.current.srcObject = new MediaStream([track]);

        // the server consumer started with media paused
        // so we need to inform the server to resume
        socket.emit("consumer-resume");
      }
    );
  };

  return (
    <div>
      <button onClick={getLocalStream}>Publish</button>
      <button onClick={goConsume}>Consume</button>
      <video ref={localVideo} autoPlay muted controls />
      <video ref={remoteVideo} autoPlay controls />
    </div>
  );
};

export default Home;
