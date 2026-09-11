"""Run ten live local-model turns with synthetic account context; writes tmp/conversation-behavior-eval.json. Run with the MLX interpreter and HF_HUB_OFFLINE=1."""
import asyncio,json,sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services import companion_chat as chat
from app.services.local_mlx_chat import LocalMLXChatProvider
from app.user_context import build_user_context
from app.routers.api_chat import COMPANION_MODE_PROMPTS
chat.local_mlx_chat=LocalMLXChatProvider()
chat.settings.chat_mlx_max_tokens=220
chat.settings.chat_mlx_thinking_mode='never'
chat.settings.chat_mlx_enable_thinking=False
cases=[('casual','Hey, taking a break from coding.'),('compliment',"You're really cute."),('factual','What is the capital of Japan?'),('emora','What is Emora?'),('team','Who created this website?'),('profile',"Do you remember what I'm trying to become?"),('emotional',"The uncertainty about my internship is bothering me more than the workload."),('technical','How does Emora use memory with FastAPI and MongoDB?'),('topic_switch','Anyway, why is the sky blue?'),('no_question','Thanks, that clears it up. Good night.')]
async def main():
 history=[];rows=[]
 for label,message in cases:
  context=build_user_context({'name':'Mahesh Reddy'},memories=[{'key':'career','value':'Aims for AI/ML engineering and research-oriented work, especially NLP, LLMs and Generative AI.'}] if label=='profile' else [])+'\nCurrent response mode: '+COMPANION_MODE_PROMPTS['listen']
  reply,_,model=await chat.get_companion_reply(message,history=history,companion_context=context)
  rows.append({'scenario':label,'message':message,'reply':reply,'model':model});print(json.dumps(rows[-1]),flush=True)
  history.extend([{'role':'user','content':message},{'role':'assistant','content':reply}])
 output=Path(__file__).resolve().parent.parent/'tmp/conversation-behavior-eval.json'
 output.parent.mkdir(exist_ok=True)
 output.write_text(json.dumps(rows,indent=2))
asyncio.run(main())
