import React, { useEffect, useRef, useState } from "react";
import Styled from "styled-components";

const Container = Styled.div`
    position: relative;
    display: inline-block;
    width: 200px;
    height: 200px;
    margin: 5px;
`;

const VideoContainer = Styled.video`
    width: 200px;
    height: 200px;
    background-color: black;
`;

interface Props {
  stream: MediaStream;
  muted?: boolean;
  style?: React.CSSProperties;
}

const Video = ({ stream, muted, style }: Props) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
    if (muted) setIsMuted(muted);
  }, [stream, muted]);

  return (
    <Container>
      <VideoContainer ref={ref} muted={isMuted} autoPlay style={style} />
    </Container>
  );
};

export default Video;
