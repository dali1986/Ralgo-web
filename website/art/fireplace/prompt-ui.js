(() => {
  'use strict';
  window.createPromptUI=({summon,wake,closeSettings})=>{
    const $=id=>document.getElementById(id);
    const panel=$('prompt-panel'),form=$('prompt-form'),input=$('vision-prompt'),feedback=$('prompt-feedback');
    const say=(message,error=false)=>{feedback.textContent=message;feedback.classList.toggle('error',error);};
    function count(){
      $('text-count').textContent=FireText.characters(input.value.normalize('NFC')).length+' / 60';
    }
    function close(focus=false){
      panel.hidden=true;$('prompt-toggle').setAttribute('aria-expanded','false');
      if(focus)$('prompt-toggle').focus();wake();
    }
    function open(){
      closeSettings();panel.hidden=false;$('prompt-toggle').setAttribute('aria-expanded','true');
      input.focus();wake();say('');count();
    }
    for(const text of ['Breathe','Stay awhile','Let it glow']){
      const example=document.createElement('button');example.type='button';example.textContent=text;
      example.addEventListener('click',()=>{input.value=text;input.focus();say('');count();});
      $('prompt-examples').appendChild(example);
    }
    $('prompt-toggle').addEventListener('click',()=>panel.hidden?open():close(true));
    $('close-prompt').addEventListener('click',()=>close(true));
    input.addEventListener('input',()=>{say('');count();});
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}
    });
    form.addEventListener('submit',e=>{
      e.preventDefault();
      try{
        const sceneId=FireScenes.installText(input.value);
        let option=$('text-scene');
        if(!option){option=document.createElement('option');option.id='text-scene';option.value=sceneId;$('scene').appendChild(option);}
        option.textContent='Your words · '+FireText.normalize(input.value);$('scene').value=sceneId;
        close(true);summon(sceneId);wake();
      }catch(error){say(error.message||'Those words could not take shape. Try a shorter message.',true);input.focus();}
    });
    count();
    // Retain the app lifecycle interface; typing suspends automatic new stories.
    return {close,cancel(){},get pending(){return !panel.hidden;}};
  };
})();
