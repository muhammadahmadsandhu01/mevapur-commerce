<?php

namespace App\Http\Traits;

trait ApiResponse
{
    protected function successResponse($data = null, $message = 'Operation successful', $code = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => $data,
            'code'    => $code,
        ], $code);
    }

    protected function errorResponse($message = 'Operation failed', $code = 400, $data = null)
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'data'    => $data,
            'code'    => $code,
        ], $code);
    }
}