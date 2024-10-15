
import { useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';


interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}



/**
 * VAD만 작동하는 ConsolePage 컴포넌트
 */
export function ConsolePage() {
  const LOCAL_RELAY_SERVER_URL: string =
    process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

  // API 키 설정 (로컬 릴레이 서버 사용 시 빈 문자열)
  const apiKey = "여기에 API 키를 입력하세요."

  // Ref 초기화
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [items, setItems] = useState<ItemType[]>([]);



  /**
   * 대화 연결 함수
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    setItems(client.conversation.getItems());

    if (wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause(); // 또는 await wavRecorder.stop();
    } else {
      console.log('connectConversation', wavRecorder.getStatus());
    }

    await wavRecorder.begin();

    console.log('connectConversation : wavRecorder begin', wavRecorder.getStatus());

    await wavStreamPlayer.connect();

    await client.connect();

    console.log(client.isConnected());

    client.updateSession({
      turn_detection: { type: 'server_vad' }, // VAD 활성화
      input_audio_transcription: { model: 'whisper-1' },
    });

    // 기본 인사 메시지 전송
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
      },
    ]);



    if (client.getTurnDetectionType() === 'server_vad') {
      console.log( 'wavRecorder.getStatus()' ,wavRecorder.getStatus());
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * 대화 연결 해제 함수
   */
  const disconnectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    client.disconnect();
    await wavRecorder.end();
    await wavStreamPlayer.interrupt();
  }, []);

  // 컴포넌트 마운트 시 VAD 연결, 언마운트 시 연결 해제
  useEffect(() => {
    connectConversation();
  }, []);

  useEffect(() => {
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });


    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);



  return (
    <div>
      <h1 onClick={disconnectConversation}>VAD가 활성화되었습니다.</h1>
    </div>
  );
}
