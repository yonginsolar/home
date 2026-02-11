-- =================================================================================
-- RPC: rpc_link_kakao (coop_members 테이블에 kakao_id를 연결하는 함수)
-- 설명: 기존 조합원 계정에 OAuth를 통해 획득한 카카오 ID를 연결합니다.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_link_kakao(
    p_member_uid uuid,  -- 연결하려는 조합원의 ID (coop_members.id)
    p_kakao_id text     -- 카카오 인증 서버에서 획득한 카카오 ID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- 함수를 정의한 사용자(supabase_admin)의 권한으로 실행
AS $function$
BEGIN
    -- 현재 인증된 사용자가 요청했는지 RLS/정책으로 확인해야 안전하지만,
    -- 클라이언트에서 current_uid를 전달하는 경우, RLS 정책이 인증된 사용자가
    -- 자신의 레코드(coop_members.id = auth.uid())만 업데이트할 수 있도록 보장해야 함.
    -- (auth_callback.html에서 current_uid는 curAuth.id로 전달됨)

    -- coop_members 테이블의 kakao_id 필드를 업데이트
    UPDATE public.coop_members
    SET kakao_id = p_kakao_id
    WHERE id = p_member_uid;

END;
$function$;

-- [정책/권한] EXECUTE 권한을 인증된 사용자에게 부여
GRANT EXECUTE ON FUNCTION public.rpc_link_kakao(uuid, text) TO authenticated;
