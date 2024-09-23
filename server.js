import { createServer } from "https";
import next from "next";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import mediasoup from "mediasoup";
import { Socket } from "socket.io-client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();
var __dirname = path.resolve();

app.prepare().then(() => {
  const options = {
    key: fs.readFileSync(path.resolve(__dirname, "certs", "key.pem")),
    cert: fs.readFileSync(path.resolve(__dirname, "certs", "cert.pem")),
  };
  const httpsServer = createServer(options, handler);

  const io = new Server(httpsServer);

  let worker;
  let router;
  let transports = [];
  let producers = [];
  let consumers = [];

  const createWorker = async () => {
    worker = await mediasoup.createWorker({
      rtcMinPort: 2000,
      rtcMaxPort: 2020,
    });
    console.log(`worker pid ${worker.pid}`);

    worker.on("died", (error) => {
      // This implies something serious happened, so kill the application
      console.error("mediasoup worker has died");
      setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
    });

    return worker;
  };

  // We create a Worker as soon as our application starts
  worker = createWorker();

  const mediaCodecs = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {
        "x-google-start-bitrate": 1000,
      },
    },
  ];
  io.on("connection", async (socket) => {
    socket.emit("connection-success", {
      socketId: socket.id,
    });

    socket.on("disconnect", () => {
      console.log("user disconnected");
    });

    socket.on("createRoom", async (callback) => {
      if (router === undefined) {
        // worker.createRouter(options)
        // options = { mediaCodecs, appData }
        // mediaCodecs -> defined above
        // appData -> custom application data - we are not supplying any
        // none of the two are required
        router = await worker.createRouter({ mediaCodecs });
        console.log(`Router ID: ${router.id}`);
      }

      getRtpCapabilities(callback);
    });

    const getRtpCapabilities = (callback) => {
      const rtpCapabilities = router.rtpCapabilities;

      callback({ rtpCapabilities });
    };

    socket.on("createWebRtcTransport", async ({ sender }, callback) => {
      console.log(`Is this a sender request? ${sender}`);
      // The client indicates if it is a producer or a consumer
      // if sender is true, indicates a producer else a consumer
      const transportIndex = transports.findIndex(
        (obj) => obj.sender === sender && obj.socketId === socket.id
      );
      console.log("matching transport found at ", transportIndex);
      if (transportIndex === -1) {
        const newTransport = {
          socketId: socket.id,
          sender,
          transport: await createWebRtcTransport(callback),
        };
        transports = [...transports, newTransport];
        console.log("-new transport created");
      } else {
        console.log("using transport", transportIndex);
        const t = transports[transportIndex];
        callback({
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
          params: {
            id: t.transport.id,
            iceParameters: t.transport.iceParameters,
            iceCandidates: t.transport.iceCandidates,
            dtlsParameters: t.transport.dtlsParameters,
          },
        });
      }
    });

    socket.on("transport-connect", async ({ dtlsParameters }) => {
      console.log("DTLS PARAMS... ", { dtlsParameters });
      await transports[
        transports.findIndex((obj) => obj.sender && obj.socketId === socket.id)
      ].transport.connect({ dtlsParameters });
    });

    socket.on(
      "transport-produce",
      async ({ kind, rtpParameters, appData }, callback) => {
        // call produce based on the prameters from the client
        let producer = await transports[
          transports.findIndex(
            (obj) => obj.sender && obj.socketId === socket.id
          )
        ].transport.produce({
          kind,
          rtpParameters,
        });

        console.log("Producer ID: ", producer.id, producer.kind);
        socket.broadcast.emit("producer-add", {
          id: producer.id,
          kind: producer.kind,
        });

        producer.on("transportclose", () => {
          console.log("transport for this producer closed ");
          producer.close();
        });

        producers = [...producers, { socketId: socket.id, producer }];

        // Send back to the client the Producer's id
        callback({
          id: producer.id,
        });
      }
    );

    socket.on("transport-recv-connect", async ({ dtlsParameters }) => {
      console.log(`DTLS PARAMS: ${dtlsParameters}`);
      const i = transports.findIndex(
        (obj) => obj.socketId === socket.id && !obj.sender
      );
      if (!transports[i].transport.appData.connected) {
        console.log("first time connection");
        transports[i].transport.appData.connected = true;
        await transports[i].transport.connect({ dtlsParameters });
      }
    });

    socket.on("getProducers", (callback) => {
      let currentProducers = [];
      producers.forEach((producer) => {
        currentProducers = [
          ...currentProducers,
          { id: producer.producer.id, kind: producer.producer.kind },
        ];
      });
      callback(currentProducers);
    });

    socket.on("consume", async ({ rtpCapabilities, producerId }, callback) => {
      try {
        // check if the router can consume the specified producer
        if (
          router.canConsume({
            producerId: producerId,
            rtpCapabilities,
          })
        ) {
          const i = transports.findIndex(
            (obj) => obj.socketId === socket.id && !obj.sender
          );
          // transport can now consume and return a consumer
          const consumer = await transports[i].transport.consume({
            producerId: producerId,
            rtpCapabilities,
            paused: true,
          });

          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });

          consumer.on("producerclose", () => {
            console.log("producer of consumer closed");
          });

          // from the consumer extract the following params
          // to send back to the Client
          const params = {
            id: consumer.id,
            producerId: producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          };
          consumers = [
            ...consumers,
            { consumer, socketId: socket.id, producerId },
          ];
          // send the parameters to the client
          callback({ params });
        }
      } catch (error) {
        console.log(error.message, error.stack);
        callback({
          params: {
            error: error,
          },
        });
      }
    });

    socket.on("consumer-resume", async ({ producerId }) => {
      console.log("consumer resume ", producerId);
      await consumers[
        consumers.findIndex(
          (obj) => obj.socketId === socket.id && obj.producerId === producerId
        )
      ].consumer.resume();
    });

    const createWebRtcTransport = async (callback) => {
      try {
        // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
        const webRtcTransport_options = {
          listenIps: [
            {
              ip: "0.0.0.0", // replace with relevant IP address
              announcedIp: "127.0.0.1",
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
        };

        // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
        let transport = await router.createWebRtcTransport(
          webRtcTransport_options
        );
        console.log(`transport id: ${transport.id}`);

        transport.on("dtlsstatechange", (dtlsState) => {
          if (dtlsState === "closed") {
            transport.close();
          }
        });

        transport.on("close", () => {
          console.log("transport closed");
        });

        // send back to the client the following prameters
        callback({
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });

        return transport;
      } catch (error) {
        console.log(error);
        callback({
          params: {
            error: error,
          },
        });
      }
    };
  });

  httpsServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on https://${hostname}:${port}`);
    });
});
