update tts_voice_profiles
set gender = 'female',
    updated_at = now()
where id = 'xunfei:x4_enus_catherine_profnews';

update tts_voice_profiles
set gender = 'male',
    display_name_zh = 'Ryan 助手男声',
    updated_at = now()
where id = 'xunfei:x4_enus_ryan_assist';
