package com.naokits.novastream;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;

/** Cercle de progression avec le pourcentage au centre. */
final class ProgressRing extends View {

    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private int percent;

    ProgressRing(Context ctx) {
        super(ctx);
        track.setStyle(Paint.Style.STROKE);
        track.setColor(0x40FFFFFF);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(0xFF3B82F6);
        text.setColor(Color.WHITE);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(Typeface.DEFAULT_BOLD);
    }

    void setPercent(int value) {
        int v = Math.max(0, Math.min(100, value));
        if (v != percent) {
            percent = v;
            invalidate();
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float size = Math.min(getWidth(), getHeight());
        float stroke = size * 0.09f;
        track.setStrokeWidth(stroke);
        arc.setStrokeWidth(stroke);
        float pad = stroke / 2 + 1;
        float left = (getWidth() - size) / 2f;
        float top = (getHeight() - size) / 2f;
        box.set(left + pad, top + pad, left + size - pad, top + size - pad);
        canvas.drawOval(box, track);
        canvas.drawArc(box, -90, 360f * percent / 100f, false, arc);
        text.setTextSize(size * 0.28f);
        float y = getHeight() / 2f - (text.descent() + text.ascent()) / 2f;
        canvas.drawText(percent + " %", getWidth() / 2f, y, text);
    }
}
