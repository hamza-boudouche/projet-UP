import React, { useState, useRef, useEffect, useCallback } from "react";
import io from "socket.io-client";
import Video from "./Components/Video";
import { WebRTCUser } from "./types";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Groupes from "Groupes";

const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

const SOCKET_SERVER_URL = "http://localhost:8081";

const App = () => {
  const socketRef = useRef<SocketIOClient.Socket>();
  const localStreamRef = useRef<MediaStream>();
  const sendPCRef = useRef<RTCPeerConnection>();
  const receivePCsRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const [users, setUsers] = useState<Array<WebRTCUser>>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const closeReceivePC = useCallback((id: string) => {
    if (!receivePCsRef.current[id]) return;
    receivePCsRef.current[id].close();
    delete receivePCsRef.current[id];
  }, []);

  const createReceiverOffer = useCallback(
    async (pc: RTCPeerConnection, senderSocketID: string) => {
      try {
        const sdp = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        console.log("create receiver offer success");
        await pc.setLocalDescription(new RTCSessionDescription(sdp));

        if (!socketRef.current) return;
        socketRef.current.emit("receiverOffer", {
          sdp,
          receiverSocketID: socketRef.current.id,
          senderSocketID,
          roomID: "1234",
        });
      } catch (error) {
        console.log(error);
      }
    },
    []
  );

  const createReceiverPeerConnection = useCallback((socketID: string) => {
    try {
      const pc = new RTCPeerConnection(config);
      receivePCsRef.current = { ...receivePCsRef.current, [socketID]: pc };
      pc.onicecandidate = (e) => {
        if (!(e.candidate && socketRef.current)) return;
        console.log("receiver PC onicecandidate");
        socketRef.current.emit("receiverCandidate", {
          candidate: e.candidate,
          receiverSocketID: socketRef.current.id,
          senderSocketID: socketID,
        });
      };

      // pc.oniceconnectionstatechange = (e) => {
      //   console.log(e);
      // };

      pc.ontrack = (e) => {
        console.log("ontrack success");
        setUsers((oldUsers) =>
          oldUsers
            .filter((user) => user.id !== socketID)
            .concat({
              id: socketID,
              stream: e.streams[0],
            })
        );
      };

      return pc;
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }, []);

  const createReceivePC = useCallback(
    (id: string) => {
      try {
        console.log(`socketID(${id}) user entered`);
        const pc = createReceiverPeerConnection(id);
        if (!(socketRef.current && pc)) return;
        createReceiverOffer(pc, id);
      } catch (error) {
        console.log(error);
      }
    },
    [createReceiverOffer, createReceiverPeerConnection]
  );

  const createSenderOffer = useCallback(async () => {
    try {
      if (!sendPCRef.current) return;
      const sdp = await sendPCRef.current.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      console.log("create sender offer success");
      await sendPCRef.current.setLocalDescription(
        new RTCSessionDescription(sdp)
      );

      if (!socketRef.current) return;
      socketRef.current.emit("senderOffer", {
        sdp,
        senderSocketID: socketRef.current.id,
        roomID: "1234",
      });
    } catch (error) {
      console.log(error);
    }
  }, []);

  const createSenderPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (e) => {
      if (!(e.candidate && socketRef.current)) return;
      console.log("sender PC onicecandidate");
      socketRef.current.emit("senderCandidate", {
        candidate: e.candidate,
        senderSocketID: socketRef.current.id,
      });
    };

    // pc.oniceconnectionstatechange = (e) => {
    //   console.log(e);
    // };

    if (localStreamRef.current) {
      console.log("add local stream");
      localStreamRef.current.getTracks().forEach((track) => {
        if (!localStreamRef.current) return;
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.log("no local stream");
    }

    sendPCRef.current = pc;
  }, []);

  const getLocalStream = useCallback(async () => {
    try {
      // @ts-ignore
      const stream = await navigator.mediaDevices.getDisplayMedia();
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      if (!socketRef.current) return;

      createSenderPeerConnection();
      await createSenderOffer();

      socketRef.current.emit("joinRoom", {
        id: socketRef.current.id,
        roomID: "1234",
      });
    } catch (e) {
      console.log(`getUserMedia error: ${e}`);
    }
  }, [createSenderOffer, createSenderPeerConnection]);

  useEffect(() => {
    socketRef.current = io.connect(SOCKET_SERVER_URL);
    getLocalStream();

    socketRef.current.on("userEnter", (data: { id: string }) => {
      createReceivePC(data.id);
    });

    socketRef.current.on(
      "allUsers",
      (data: { users: Array<{ id: string }> }) => {
        data.users.forEach((user) => createReceivePC(user.id));
      }
    );

    socketRef.current.on("userExit", (data: { id: string }) => {
      closeReceivePC(data.id);
      setUsers((users) => users.filter((user) => user.id !== data.id));
    });

    socketRef.current.on(
      "getSenderAnswer",
      async (data: { sdp: RTCSessionDescription }) => {
        try {
          if (!sendPCRef.current) return;
          console.log("get sender answer");
          console.log(data.sdp);
          await sendPCRef.current.setRemoteDescription(
            new RTCSessionDescription(data.sdp)
          );
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on(
      "getSenderCandidate",
      async (data: { candidate: RTCIceCandidateInit }) => {
        try {
          if (!(data.candidate && sendPCRef.current)) return;
          console.log("get sender candidate");
          await sendPCRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
          console.log("candidate add success");
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on(
      "getReceiverAnswer",
      async (data: { id: string; sdp: RTCSessionDescription }) => {
        try {
          console.log(`get socketID(${data.id})'s answer`);
          const pc: RTCPeerConnection = receivePCsRef.current[data.id];
          if (!pc) return;
          await pc.setRemoteDescription(data.sdp);
          console.log(`socketID(${data.id})'s set remote sdp success`);
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on(
      "getReceiverCandidate",
      async (data: { id: string; candidate: RTCIceCandidateInit }) => {
        try {
          console.log(data);
          console.log(`get socketID(${data.id})'s candidate`);
          const pc: RTCPeerConnection = receivePCsRef.current[data.id];
          if (!(pc && data.candidate)) return;
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log(`socketID(${data.id})'s candidate add success`);
        } catch (error) {
          console.log(error);
        }
      }
    );

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (sendPCRef.current) {
        sendPCRef.current.close();
      }
      users.forEach((user) => closeReceivePC(user.id));
    };
    // eslint-disable-next-line
  }, [
    closeReceivePC,
    createReceivePC,
    createSenderOffer,
    createSenderPeerConnection,
    getLocalStream,
  ]);

  return (
    <BrowserRouter>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
        }}
      >
        <div
          style={{
            width: "20vw",
            height: "100vh",
            backgroundColor: "white",
            borderRight: "1px solid grey",
            boxShadow: "8px 0px 50px -18px rgba(0,0,0,0.81)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "10vh",
              border: "1px solid black",
            }}
          >
            logo
          </div>
          <div
            style={{
              height: "5vh",
              borderBottom: "1px solid black",
              padding: "1rem",
            }}
          >
            <Link to="videosharing">Desktop sharing</Link>
          </div>
          <div
            style={{
              height: "5vh",
              borderBottom: "1px solid black",
              padding: "1rem",
            }}
          >
            <Link to="groupes">Groupes</Link>
          </div>
        </div>
        <div>
          <div
            style={{
              backgroundColor: "#006FFF",
              width: "80vw",
              height: "10vh",
              paddingLeft: "20px",
            }}
          >
            <div
              style={{
                paddingTop: "20px",
                fontSize: "25px",
                color: "white",
              }}
            >
              PresentBox
            </div>
          </div>

          <Routes>
            <Route path="/" element={<>hello</>} />
            <Route
              path="/videosharing"
              element={
                <>
                  <video
                    style={{
                      width: "60vw",
                      height: "60vh",
                      margin: 5,
                      backgroundColor: "black",
                    }}
                    muted
                    ref={localVideoRef}
                    autoPlay
                  />
                  <br />
                  {users.map((user, index) => (
                    <Video key={index} stream={user.stream} style={{}} />
                  ))}
                </>
              }
            />
            <Route path="/groupes" element={<Groupes />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
