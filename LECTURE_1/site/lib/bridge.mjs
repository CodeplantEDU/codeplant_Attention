import {randomBytes,timingSafeEqual} from 'node:crypto';

export const WEB_ORIGIN='https://codeplant-attention.vercel.app';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createBridge({origin=WEB_ORIGIN,now=Date.now}={}){
  if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('공개 사이트의 정확한 HTTPS 출처가 필요합니다.');
  let invitation=null;
  const sessions=new Map();
  return {
    origin,
    issue(){invitation={code:randomBytes(24).toString('hex'),expiresAt:now()+300000,attempts:0};return {code:invitation.code,expiresAt:invitation.expiresAt,origin};},
    connect(requestOrigin,code){
      if(requestOrigin!==origin||!invitation||invitation.expiresAt<=now()||invitation.attempts++>=5||!same(code,invitation.code))throw Error('연결 코드가 올바르지 않거나 만료됐습니다. PC에서 새 코드를 발급하세요.');
      invitation=null;
      for(const [token,expires]of sessions)if(expires<=now())sessions.delete(token);
      if(sessions.size>=8)throw Error('연결 수가 초과됐습니다. PC에서 웹 연결을 해제하세요.');
      const token=randomBytes(32).toString('hex');sessions.set(token,now()+43200000);return {token};
    },
    valid(requestOrigin,token){return requestOrigin===origin&&typeof token==='string'&&(sessions.get(token)||0)>now();},
    disconnect(token){sessions.delete(token);},
    revoke(){invitation=null;sessions.clear();}
  };
}
