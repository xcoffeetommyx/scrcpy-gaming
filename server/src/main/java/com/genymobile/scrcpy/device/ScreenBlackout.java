package com.genymobile.scrcpy.device;

import com.genymobile.scrcpy.display.DisplayInfo;
import com.genymobile.scrcpy.util.Ln;
import com.genymobile.scrcpy.wrappers.ServiceManager;

import android.annotation.SuppressLint;
import android.view.InputDevice;

/** Covers the physical display without powering down a handheld's controller. */
@SuppressLint("PrivateApi,DiscouragedPrivateApi")
public final class ScreenBlackout implements AutoCloseable {
    private Object layer;
    private Object transaction;
    private Class<?> surfaceClass;
    private Class<?> transactionClass;

    public static boolean hasGameController() {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice device = InputDevice.getDevice(id);
            if (device != null && !device.isVirtual()
                    && (device.supportsSource(InputDevice.SOURCE_GAMEPAD) || device.supportsSource(InputDevice.SOURCE_JOYSTICK))) {
                return true;
            }
        }
        return false;
    }

    public boolean show() {
        if (layer != null) {
            return true;
        }
        try {
            DisplayInfo display = ServiceManager.getDisplayManager().getDisplayInfo(0);
            if (display == null) {
                throw new IllegalStateException("Physical display not found");
            }
            surfaceClass = Class.forName("android.view.SurfaceControl");
            Class<?> builderClass = Class.forName("android.view.SurfaceControl$Builder");
            transactionClass = Class.forName("android.view.SurfaceControl$Transaction");
            Object builder = builderClass.getConstructor().newInstance();
            builderClass.getMethod("setName", String.class).invoke(builder, "Scrcpy GO handheld blackout");
            builderClass.getMethod("setColorLayer").invoke(builder);
            layer = builderClass.getMethod("build").invoke(builder);
            transaction = transactionClass.getConstructor().newInstance();
            transactionClass.getMethod("setLayerStack", surfaceClass, int.class).invoke(transaction, layer, display.getLayerStack());
            transactionClass.getMethod("setLayer", surfaceClass, int.class).invoke(transaction, layer, Integer.MAX_VALUE);
            transactionClass.getMethod("setColor", surfaceClass, float[].class).invoke(transaction, layer, new float[] {0, 0, 0});
            // A square also covers the display after rotation. Allow for resolution changes while docked.
            int edge = Math.max(8192, display.getSize().getMax());
            transactionClass.getMethod("setWindowCrop", surfaceClass, int.class, int.class).invoke(transaction, layer, edge, edge);
            transactionClass.getMethod("show", surfaceClass).invoke(transaction, layer);
            transactionClass.getMethod("apply").invoke(transaction);
            return true;
        } catch (ReflectiveOperationException | RuntimeException e) {
            Ln.w("Could not black out the handheld screen; keeping it on so its controls remain available", e);
            close();
            return false;
        }
    }

    @Override
    public void close() {
        if (layer != null) {
            try {
                if (transaction != null) {
                    transactionClass.getMethod("remove", surfaceClass).invoke(transaction, layer);
                    transactionClass.getMethod("apply").invoke(transaction);
                }
            } catch (ReflectiveOperationException | RuntimeException e) {
                Ln.w("Could not remove handheld blackout layer", e);
            } finally {
                try {
                    surfaceClass.getMethod("release").invoke(layer);
                } catch (ReflectiveOperationException | RuntimeException e) {
                    Ln.w("Could not release handheld blackout layer", e);
                }
                layer = null;
            }
        }
        if (transaction != null) {
            try {
                transactionClass.getMethod("close").invoke(transaction);
            } catch (ReflectiveOperationException | RuntimeException e) {
                Ln.w("Could not release handheld blackout transaction", e);
            }
            transaction = null;
        }
    }
}
