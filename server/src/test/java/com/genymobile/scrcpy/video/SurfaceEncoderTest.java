package com.genymobile.scrcpy.video;

import com.genymobile.scrcpy.model.CodecOption;

import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

public class SurfaceEncoderTest {

    @Test
    public void testHasCodecOption() {
        List<CodecOption> options = Arrays.asList(
                new CodecOption("priority", 0),
                new CodecOption("operating-rate", 120.0f));

        Assert.assertTrue(SurfaceEncoder.hasCodecOption(options, "operating-rate"));
        Assert.assertFalse(SurfaceEncoder.hasCodecOption(options, "latency"));
        Assert.assertFalse(SurfaceEncoder.hasCodecOption(null, "operating-rate"));
    }
}
