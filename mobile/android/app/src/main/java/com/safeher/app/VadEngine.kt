package com.safeher.app

import android.content.Context
import android.util.Log
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.nio.LongBuffer

class VadEngine(context: Context) {
    private val TAG = "SafeHerVadEngine"
    private var env: OrtEnvironment? = null
    private var session: OrtSession? = null

    // VAD Model Constants (Silero v4.0)
    private val BATCH_SIZE = 1L
    private val SEQUENCE_LENGTH = 512L
    private val HIDDEN_DIM = 64L
    private val TENSOR_SHAPE_H_C = longArrayOf(2, BATCH_SIZE, HIDDEN_DIM)
    private val TENSOR_SHAPE_INPUT = longArrayOf(BATCH_SIZE, SEQUENCE_LENGTH)

    private val STATE_BUFFER_SIZE = (2 * BATCH_SIZE * HIDDEN_DIM).toInt()

    // Persistent State Arrays for Recurrence
    private var hArray = FloatArray(STATE_BUFFER_SIZE) { 0.0f }
    private var cArray = FloatArray(STATE_BUFFER_SIZE) { 0.0f }
    private val srArray = longArrayOf(16000L) // Statically bound Sample Rate Tensor [1]

    init {
        try {
            env = OrtEnvironment.getEnvironment()
            val assetManager = context.assets
            val modelBytes = assetManager.open("silero_vad.onnx").readBytes()

            // Minimal optimization for performance / CPU exclusively
            val sessionOptions = OrtSession.SessionOptions().apply {
                setIntraOpNumThreads(1)
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT)
            }

            session = env?.createSession(modelBytes, sessionOptions)
            Log.i(TAG, "ONNX Runtime Initialized Successfully")
            resetState()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize ONNX VAD Engine", e)
        }
    }

    /**
     * Resets the LSTM/RNN Hidden State cleanly preventing past generation drift.
     */
    fun resetState() {
        hArray.fill(0.0f)
        cArray.fill(0.0f)
        Log.i(TAG, "VAD_CONTINUITY_RESET: Recurrent states zeroed")
    }

    /**
     * Evaluates a temporal sequence array directly against the prebound neural net natively.
     */
    fun processChunkFast(inputSamples: ShortArray): Double {
        if (inputSamples.size != SEQUENCE_LENGTH.toInt()) {
            throw IllegalArgumentException("VAD chunk size must be exactly $SEQUENCE_LENGTH")
        }

        val safeEnv = env ?: return 0.0
        val safeSession = session ?: return 0.0

        // Normalize samples Float32 [-1, 1]
        val floatInput = FloatArray(inputSamples.size)
        for (i in inputSamples.indices) {
            floatInput[i] = inputSamples[i] / 32768.0f
        }

        var inputTensor: OnnxTensor? = null
        var hTensor: OnnxTensor? = null
        var cTensor: OnnxTensor? = null
        var srTensor: OnnxTensor? = null
        var result: OrtSession.Result? = null

        try {
            // Allocate Inputs
            inputTensor = OnnxTensor.createTensor(safeEnv, FloatBuffer.wrap(floatInput), TENSOR_SHAPE_INPUT)
            hTensor = OnnxTensor.createTensor(safeEnv, FloatBuffer.wrap(hArray), TENSOR_SHAPE_H_C)
            cTensor = OnnxTensor.createTensor(safeEnv, FloatBuffer.wrap(cArray), TENSOR_SHAPE_H_C)
            srTensor = OnnxTensor.createTensor(safeEnv, LongBuffer.wrap(srArray), longArrayOf(1))

            val inputMap = mapOf(
                "input" to inputTensor,
                "sr" to srTensor,
                "h" to hTensor,
                "c" to cTensor
            )

            // Execute ONNX Native Graph
            result = safeSession.run(inputMap)

            // Extract Values safely over indexed properties verified locally
            val outProb = (result.get(0).value as Array<FloatArray>)[0][0]
            val outH = (result.get(1).value as Array<Array<FloatArray>>)
            val outC = (result.get(2).value as Array<Array<FloatArray>>)

            // Flatten extracted Arrays back into continuous state buffers safely allocating memory limits
            var index = 0
            for (dim0 in 0..1) {
                for (dim1 in 0..0) { // Batch is 1
                    for (dim2 in 0 until 64) {
                        hArray[index] = outH[dim0][dim1][dim2]
                        cArray[index] = outC[dim0][dim1][dim2]
                        index++
                    }
                }
            }

            return outProb.toDouble()

        } catch (e: Exception) {
            Log.e(TAG, "Inference Failed", e)
            return 0.0
        } finally {
            // Safely prevent C-heap memory leaks synchronously forcing garbage collection
            inputTensor?.close()
            hTensor?.close()
            cTensor?.close()
            srTensor?.close()
            result?.close()
        }
    }

    fun close() {
        try {
            session?.close()
            env?.close()
            Log.i(TAG, "ONNX Runtime Teardown Complete")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing VAD engine", e)
        }
    }
}
